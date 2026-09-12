using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Common.Conflicts;
using ExcelArchive.Application.DTOs.ConflictDto;
using ExcelArchive.Application.Interfaces.Caching;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Domain.Conflicts;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Application.Services;

public class ConflictService(
    IConflictRepository conflicts,
    IConflictCacheService cache,
    IConflictExportBuilder exports) : IConflictService
{
    public async Task<ConflictListResult> ListAsync(ValidConflictRequest request, DataScopeDto scope, CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var key = ConflictCacheKeys.BuildKey("list", ConflictCacheKeys.CanonicalListKey(
            request.Category, request.Field, request.Rule,
            request.Page, request.PageSize, request.SortBy, request.SortDir,
            scope.FileIds?.ToList()));
        return await cache.GetOrComputeAsync(key, today,
            () => ListCoreAsync(request, scope, today, ct), ct);
    }

    private async Task<ConflictListResult> ListCoreAsync(
        ValidConflictRequest request, DataScopeDto scope, DateOnly today, CancellationToken ct)
    {
        var selected = ConflictCatalog.SelectedRules(request.Category, request.Field, request.Rule)
            .Select(r => r.Key).ToHashSet(StringComparer.Ordinal);

        // Scope: global (GroupIds null) sees everything; scoped users are
        // bounded by their visible file ids (empty = nothing, V1 AND FALSE).
        if (scope.GroupIds is not null && (scope.FileIds is null || scope.FileIds.Count == 0))
            return new ConflictListResult([], 0, request.Page, request.PageSize, 0);

        var records = await LoadRecordsAsync(scope, ct);
        if (records.Count == 0)
            return new ConflictListResult([], 0, request.Page, request.PageSize, 0);

        var (engineRows, ignoredPairs, _) = await LoadEngineDataAsync(records, ct);

        // Per-row invalid/missing.
        var perRow = new Dictionary<Guid, List<ConflictEngine.EngineIssue>>();
        foreach (var row in engineRows)
        {
            var list = ConflictEngine.EvaluateInvalidMissing(row, today, selected)
                .Where(iss => !ignoredPairs.Contains($"{iss.Rule}|{row.Id}"))
                .ToList();
            if (list.Count > 0)
                perRow[row.Id] = list;
        }

        // Grouped similar2 (only when the category selects it).
        var similar = new Dictionary<Guid, IReadOnlyList<ConflictEngine.EngineIssue>>();
        if (request.Category == "similar")
        {
            var sim = ConflictEngine.EvaluateSimilar(engineRows, selected);
            foreach (var kv in sim)
            {
                var kept = kv.Value.Where(iss => !ignoredPairs.Contains($"{iss.Rule}|{kv.Key}")).ToList();
                if (kept.Count > 0)
                    similar[kv.Key] = kept;
            }
        }

        // Conflicting36 (only when the category selects it).
        var conflicting = new Dictionary<Guid, IReadOnlyList<ConflictEngine.EngineIssue>>();
        if (request.Category == "conflicting")
        {
            var conf = ConflictEngine.EvaluateConflicting(engineRows, selected);
            foreach (var kv in conf)
            {
                var kept = kv.Value.Where(iss => !ignoredPairs.Contains($"{iss.Rule}|{kv.Key}")).ToList();
                if (kept.Count > 0)
                    conflicting[kv.Key] = kept;
            }
        }

        // Merge per-row + similar + conflicting into multi-issue rows.
        var allIds = perRow.Keys.Concat(similar.Keys).Concat(conflicting.Keys).Distinct().ToHashSet();
        if (allIds.Count == 0)
            return new ConflictListResult([], 0, request.Page, request.PageSize, 0);

        var byId = engineRows.ToDictionary(r => r.Id);
        var combined = new List<(ConflictEngine.EngineRow Row, List<ConflictEngine.EngineIssue> Issues)>();
        foreach (var id in allIds)
        {
            var row = byId[id];
            var list = new List<ConflictEngine.EngineIssue>();
            if (perRow.TryGetValue(id, out var a)) list.AddRange(a);
            if (similar.TryGetValue(id, out var b)) list.AddRange(b);
            if (conflicting.TryGetValue(id, out var c)) list.AddRange(c);
            list = list.OrderBy(i => i.Rule, StringComparer.Ordinal).ThenBy(i => i.Explanation, StringComparer.Ordinal).ToList();
            combined.Add((row, list));
        }

        // Keys for grouping/sorting/display (V1 reportCtes).
        var enriched = combined.Select(t => Enrich(t.Row, t.Issues)).ToList();

        // GroupKey + issueNumber (V1 groupKeyExpression).
        if (request.Category == "conflicting" && request.Rule != "all")
        {
            var views = enriched.ToDictionary(e => e.Row.Id, e => ConflictEngine.ViewOf(e.Row));
            var keys = new Dictionary<Guid, string?>();
            foreach (var e in enriched)
                keys[e.Row.Id] = ConflictEngine.ConflictingGroupKey(request.Rule, views[e.Row.Id]);
            if (keys.Values.Any(v => v is not null))
            {
                var groups = enriched.Where(e => keys[e.Row.Id] is not null)
                    .GroupBy(e => keys[e.Row.Id]!, StringComparer.Ordinal)
                    .OrderBy(g => g.Key, StringComparer.Ordinal).ToList();
                var num = 0;
                foreach (var g in groups)
                {
                    num++;
                    foreach (var e in g) { e.GroupKey = g.Key; e.IssueNumber = num; }
                }
                // Rows without a group key (should not happen for matched
                // rows) stay isolated with trailing numbers.
                foreach (var e in enriched.Where(e => keys[e.Row.Id] is null))
                {
                    num++;
                    e.GroupKey = e.Row.Id.ToString();
                    e.IssueNumber = num;
                }
            }
            else
            {
                AssignPerRowNumbers(enriched);
            }
        }
        else if (request.Category == "similar")
        {
            var groups = enriched.GroupBy(e => e.NameKey, StringComparer.Ordinal)
                .OrderBy(g => g.Key, StringComparer.Ordinal).ToList();
            var num = 0;
            foreach (var g in groups)
            {
                num++;
                foreach (var e in g) { e.GroupKey = g.Key; e.IssueNumber = num; }
            }
        }
        else
        {
            enriched = AssignPerRowNumbers(enriched);
        }

        // Sort (V1 sortOrderSql) + stable id tiebreak.
        enriched = SortRows(enriched, request.SortBy, request.SortDir);

        var total = enriched.Count;
        var pageCount = total == 0 ? 0 : (int)Math.Ceiling(total / (double)request.PageSize);
        var pageRows = enriched
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(e => new ConflictRowDto(
                e.Row.Id, e.Row.FileId, e.Row.GroupId,
                e.Row.FileName, e.Row.OriginalFilename, e.Row.RowIndex,
                e.DisplayName, e.MotherDisplay, e.NationalDisplay,
                e.ShamDisplay, e.PersonalDisplay, e.PhoneDisplay,
                e.Row.SfFunctionalCategory,
                e.GroupKey, e.IssueNumber,
                e.Issues.Select(i => new ConflictIssueDto(i.Rule, i.Label, i.Explanation)).ToList()))
            .ToList();

        return new ConflictListResult(pageRows, total, request.Page, request.PageSize, pageCount);
    }

    public async Task IgnoreAsync(string rule, Guid recordId, DataScopeDto scope, CancellationToken ct = default)
    {
        // V1 conflicts/ignore/route.ts: unknown rule → 400; missing record
        // or invisible file → hidden 404; idempotent rule+record upsert.
        if (string.IsNullOrWhiteSpace(rule) || !ConflictCatalog.ByKey.ContainsKey(rule))
            throw new InvalidDataException("بيانات التجاهل غير صالحة.");
        var fileId = await conflicts.FindRecordFileIdAsync(recordId, ct);
        if (fileId is null) throw new KeyNotFoundException("غير موجود.");
        if (scope.FileIds is not null && !scope.FileIds.Contains(fileId.Value))
            throw new KeyNotFoundException("غير موجود.");
        if (await conflicts.IgnoredExistsAsync(rule, recordId, ct)) return;
        await conflicts.AddIgnoreAsync(rule, recordId, ct);
        // Mirror the ignored_conflicts statement trigger on providers that
        // do not run it (EF InMemory in tests); on PostgreSQL the trigger
        // bumps the same row again, which is harmless.
        await conflicts.BumpRevisionAsync(ct);
    }

    public async Task<byte[]> ExportAsync(ValidConflictRequest request, DataScopeDto scope, CancellationToken ct = default)
    {
        // V1 conflicts/export/route.ts: one archive scan (page 1, 20000),
        // sliced to MAX_ROWS, same permission/filter semantics as the list.
        const int MaxRows = 20000;
        var full = await ListAsync(request with { Page = 1, PageSize = MaxRows }, scope, ct);
        return exports.Build(full.Rows.Take(MaxRows).ToList(), ct);
    }

    public async Task<ConflictStatsDto> StatsAsync(DataScopeDto scope, CancellationToken ct = default)
    {
        // V1 queryConflictStats: every rule without details over one scan.
        if (scope.GroupIds is not null && (scope.FileIds is null || scope.FileIds.Count == 0))
            return ConflictStatsDto.Empty;
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var records = await LoadRecordsAsync(scope, ct);
        var (engineRows, ignoredPairs, filesScanned) = await LoadEngineDataAsync(records, ct);
        if (engineRows.Count == 0)
            return ConflictStatsDto.Empty with
            {
                Ignored = await conflicts.IgnoredCountAsync(ct),
            };
        var allRules = ConflictCatalog.Rules.Select(r => r.Key).ToHashSet(StringComparer.Ordinal);
        var perRow = new List<(Guid Id, string Rule)>();
        foreach (var row in engineRows)
            foreach (var iss in ConflictEngine.EvaluateInvalidMissing(row, today, allRules))
                if (!ignoredPairs.Contains($"{iss.Rule}|{row.Id}"))
                    perRow.Add((row.Id, iss.Rule));
        foreach (var kv in ConflictEngine.EvaluateSimilar(engineRows, allRules))
            foreach (var iss in kv.Value)
                if (!ignoredPairs.Contains($"{iss.Rule}|{kv.Key}"))
                    perRow.Add((kv.Key, iss.Rule));
        foreach (var kv in ConflictEngine.EvaluateConflicting(engineRows, allRules))
            foreach (var iss in kv.Value)
                if (!ignoredPairs.Contains($"{iss.Rule}|{kv.Key}"))
                    perRow.Add((kv.Key, iss.Rule));
        var byId = engineRows.ToDictionary(r => r.Id);
        var rules = perRow
            .GroupBy(p => p.Rule, StringComparer.Ordinal)
            .Select(g =>
            {
                ConflictCatalog.ByKey.TryGetValue(g.Key, out var def);
                return new ConflictStatsRuleDto(g.Key, def?.Label ?? g.Key,
                    def?.Category ?? "conflicting",
                    g.Count(), g.Select(p => p.Id).Distinct().Count());
            })
            .OrderByDescending(r => r.Instances).ThenBy(r => r.Rule, StringComparer.Ordinal)
            .ToList();
        var files = perRow
            .Select(p => byId[p.Id])
            .GroupBy(r => r.FileId)
            .Select(g =>
            {
                var first = g.First();
                return new ConflictStatsFileDto(first.FileId, first.FileName, first.GroupId, g.Count());
            })
            .OrderByDescending(f => f.Instances).ThenBy(f => f.FileId)
            .Take(50)
            .ToList();
        return new ConflictStatsDto(
            perRow.Count,
            perRow.Select(p => p.Id).Distinct().Count(),
            filesScanned,
            engineRows.Count,
            await conflicts.IgnoredCountAsync(ct),
            rules,
            files);
    }

    /// <summary>V1 base CTE scope + active-job exclusion (shared by list/stats).</summary>
    private async Task<List<Record>> LoadRecordsAsync(DataScopeDto scope, CancellationToken ct)
    {
        var activeSet = (await conflicts.ActiveJobFileIdsAsync(ct)).ToHashSet();

        var records = await conflicts.ListConflictRecordsAsync(scope.FileIds, ct);
        return records.Where(r => !activeSet.Contains(r.FileId)).ToList();
    }

    private async Task<(List<ConflictEngine.EngineRow> Rows, HashSet<string> IgnoredPairs, int FilesScanned)>
        LoadEngineDataAsync(List<Record> records, CancellationToken ct)
    {
        var fileIds = records.Select(r => r.FileId).Distinct().ToList();
        var columnsByFile = await conflicts.ColumnsByFilesAsync(fileIds, ct);
        var recordIds = records.Select(r => r.Id).ToList();
        var ignored = await conflicts.IgnoredByRecordIdsAsync(recordIds, ct);
        var ignoredPairs = ignored.Select(i => $"{i.Rule}|{i.RecordId}").ToHashSet(StringComparer.Ordinal);
        var engineRows = records.Select(r => BuildEngineRow(r, columnsByFile)).ToList();
        return (engineRows, ignoredPairs, fileIds.Count);
    }

    /// <summary>V1 ROW_NUMBER(name,mother,file,row,id): per-row issue numbers.</summary>
    private static List<Enriched> AssignPerRowNumbers(List<Enriched> rows)
    {
        var ordered = rows
            .OrderBy(e => e.NameKey, StringComparer.Ordinal)
            .ThenBy(e => e.MotherKey, StringComparer.Ordinal)
            .ThenBy(e => e.FileName, StringComparer.Ordinal)
            .ThenBy(e => e.Row.RowIndex)
            .ThenBy(e => e.Row.Id)
            .ToList();
        var num = 0;
        foreach (var e in ordered)
        {
            num++;
            e.GroupKey = e.Row.Id.ToString();
            e.IssueNumber = num;
        }
        return ordered;
    }

    private sealed class Enriched
    {
        public required ConflictEngine.EngineRow Row { get; init; }
        public required List<ConflictEngine.EngineIssue> Issues { get; init; }
        public required string DisplayName { get; init; }
        public required string MotherDisplay { get; init; }
        public required string NationalDisplay { get; init; }
        public required string ShamDisplay { get; init; }
        public required string PersonalDisplay { get; init; }
        public required string PhoneDisplay { get; init; }
        public required string NameKey { get; init; }
        public required string MotherKey { get; init; }
        public required string? NationalKey { get; init; }
        public required string? ShamKey { get; init; }
        public required string? PersonalKey { get; init; }
        public required string? FunctionalKey { get; init; }
        public required string FileName { get; init; }
        public string? GroupKey { get; set; }
        public int IssueNumber { get; set; }
    }

    private static Enriched Enrich(ConflictEngine.EngineRow row, List<ConflictEngine.EngineIssue> issues)
    {
        var displayName = ConflictEngine.TrimCell(row.DisplayName);
        if (displayName == "") displayName = ConflictEngine.TrimCell(row.FullRaw);
        var motherDisplay = ConflictEngine.TrimCell(row.MotherRaw);
        var nationalKey = ConflictEngine.NationalKey(row.NationalRaw);
        string nationalDisplay = nationalKey is not null
            ? nationalKey.PadLeft(11, '0')
            : ArabicNormalizer.ToLatinDigits(ConflictEngine.TrimCell(row.NationalRaw));
        var shamDisplay = ConflictEngine.TrimCell(row.ShamRaw);
        var personalDisplay = ConflictEngine.TrimCell(row.PersonalRaw);
        var phoneDisplay = ConflictEngine.TrimCell(row.PhoneRaw);
        return new Enriched
        {
            Row = row,
            Issues = issues,
            DisplayName = displayName,
            MotherDisplay = motherDisplay,
            NationalDisplay = nationalDisplay,
            ShamDisplay = shamDisplay,
            PersonalDisplay = personalDisplay,
            PhoneDisplay = phoneDisplay,
            NameKey = ConflictEngine.Normalize(displayName),
            MotherKey = ConflictEngine.Normalize(motherDisplay),
            NationalKey = nationalKey,
            ShamKey = ConflictEngine.NumericKey(ConflictEngine.NumericInput(row.ShamRaw)),
            PersonalKey = ConflictEngine.NumericKey(ConflictEngine.NumericInput(row.PersonalRaw)),
            FunctionalKey = row.SfFunctionalCategory?.ToString(),
            FileName = row.FileName,
        };
    }

    private static List<Enriched> SortRows(List<Enriched> rows, string sortBy, string sortDir)
    {
        var desc = string.Equals(sortDir, "desc", StringComparison.OrdinalIgnoreCase);
        int NullRank(string? v) => v is null ? (desc ? 1 : -1) : 0;

        IOrderedEnumerable<Enriched> ordered = (sortBy switch
        {
            "fileName" => desc
                ? rows.OrderByDescending(e => e.FileName, StringComparer.Ordinal)
                : rows.OrderBy(e => e.FileName, StringComparer.Ordinal),
            "fullName" => desc
                ? rows.OrderByDescending(e => e.NameKey, StringComparer.Ordinal)
                : rows.OrderBy(e => e.NameKey, StringComparer.Ordinal),
            "motherName" => desc
                ? rows.OrderByDescending(e => e.MotherKey, StringComparer.Ordinal)
                : rows.OrderBy(e => e.MotherKey, StringComparer.Ordinal),
            "nationalId" => desc
                ? rows.OrderByDescending(e => e.NationalKey, StringComparer.Ordinal).ThenBy(e => NullRank(e.NationalKey))
                : rows.OrderBy(e => NullRank(e.NationalKey)).ThenBy(e => e.NationalKey, StringComparer.Ordinal),
            "shamCash" => desc
                ? rows.OrderByDescending(e => e.ShamKey, StringComparer.Ordinal).ThenBy(e => NullRank(e.ShamKey))
                : rows.OrderBy(e => NullRank(e.ShamKey)).ThenBy(e => e.ShamKey, StringComparer.Ordinal),
            "personalNo" => desc
                ? rows.OrderByDescending(e => e.PersonalKey, StringComparer.Ordinal).ThenBy(e => NullRank(e.PersonalKey))
                : rows.OrderBy(e => NullRank(e.PersonalKey)).ThenBy(e => e.PersonalKey, StringComparer.Ordinal),
            "functionalCategory" => desc
                ? rows.OrderByDescending(e => e.FunctionalKey, StringComparer.Ordinal).ThenBy(e => NullRank(e.FunctionalKey))
                : rows.OrderBy(e => NullRank(e.FunctionalKey)).ThenBy(e => e.FunctionalKey, StringComparer.Ordinal),
            _ => desc
                ? rows.OrderByDescending(e => e.IssueNumber).ThenBy(e => e.NameKey, StringComparer.Ordinal)
                : rows.OrderBy(e => e.IssueNumber).ThenBy(e => e.NameKey, StringComparer.Ordinal),
        });

        // V1 secondary ties: issueNumber path adds name/mother/file/row; other
        // sorts add issue_number + name; page_rows always ends with id ASC.
        if (sortBy == "issueNumber")
            ordered = ordered.ThenBy(e => e.MotherKey, StringComparer.Ordinal)
                .ThenBy(e => e.FileName, StringComparer.Ordinal)
                .ThenBy(e => e.Row.RowIndex);
        else
            ordered = ordered.ThenBy(e => e.IssueNumber).ThenBy(e => e.NameKey, StringComparer.Ordinal);

        return ordered.ThenBy(e => e.Row.Id).ToList();
    }

    private static ConflictEngine.EngineRow BuildEngineRow(
        Record record, Dictionary<Guid, List<FileColumn>> columnsByFile)
    {
        var cols = columnsByFile.TryGetValue(record.FileId, out var list) ? list : [];
        var headerByField = new Dictionary<string, string>(StringComparer.Ordinal);
        var mapped = new HashSet<string>(StringComparer.Ordinal);
        var dateHeaders = new List<string>();
        foreach (var c in cols)
        {
            if (!c.StandardField.HasValue) continue;
            var key = StandardFieldKeys.Key(c.StandardField.Value);
            if (key is null) continue;
            mapped.Add(key);
            headerByField[key] = c.HeaderRaw;
        }
        foreach (var c in cols)
        {
            if (ConflictEngine.Normalize(c.HeaderRaw).Contains("تاريخ"))
                dateHeaders.Add(c.HeaderRaw);
        }

        var data = ParseData(record.Data);
        string Raw(string field, string? fallback)
        {
            if (headerByField.TryGetValue(field, out var h))
                return data.TryGetValue(h, out var v) ? v ?? "" : "";
            return fallback ?? "";
        }

        var first = Raw("first_name", record.SfFirstName);
        var father = Raw("father_name", record.SfFatherName);
        var last = Raw("last_name", record.SfLastName);
        var full = Raw("full_name", record.SfFullName);
        var display = ConflictEngine.TrimCell(record.SfFullName ?? "") != ""
            ? record.SfFullName ?? ""
            : string.Join(" ", new[] { first, father, last }
                .Select(ConflictEngine.TrimCell).Where(s => s != ""));
        if (ConflictEngine.TrimCell(display) == "" && ConflictEngine.TrimCell(full) != "")
            display = full;

        var national = headerByField.ContainsKey("national_id")
            ? Raw("national_id", null)
            : record.SfNationalId?.ToString() ?? "";
        var sham = headerByField.ContainsKey("sham_cash")
            ? Raw("sham_cash", null)
            : record.SfShamCash?.ToString() ?? "";
        var personal = Raw("personal_no", record.SfPersonalNo);
        var mother = Raw("mother_name", record.SfMotherName);
        var job = Raw("job_title", record.SfJobTitle);
        var phone = Raw("phone", record.SfPhone);
        var functional = Raw("functional_category", record.SfFunctionalCategory?.ToString());
        var contract = Raw("contract_code", record.SfContractCode);
        var secondary = Raw("secondary_contract_code", record.SfSecondaryContractCode);
        var orgLevel = Raw("organizational_level", record.SfOrganizationalLevel);

        var dateCells = dateHeaders
            .Select(h => new ConflictEngine.DateCell(h, data.TryGetValue(h, out var v) ? v ?? "" : ""))
            .ToList();

        return new ConflictEngine.EngineRowWithHeaders(
            record.Id, record.FileId, record.File.GroupId,
            record.File.Name, record.File.OriginalFilename, record.RowIndex,
            display, mother, national, sham, personal, full, first, father, last,
            job, phone, functional, record.SfFunctionalCategory,
            mapped, dateCells, headerByField,
            ContractRaw: contract, SecondaryRaw: secondary, OrgLevelRaw: orgLevel);
    }

    private static Dictionary<string, string> ParseData(System.Text.Json.JsonDocument? doc)
    {
        if (doc is null || doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object)
            return new Dictionary<string, string>(StringComparer.Ordinal);
        var dict = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var p in doc.RootElement.EnumerateObject())
        {
            dict[p.Name] = p.Value.ValueKind == System.Text.Json.JsonValueKind.String
                ? p.Value.GetString() ?? ""
                : p.Value.ValueKind is System.Text.Json.JsonValueKind.Null or System.Text.Json.JsonValueKind.Undefined
                    ? "" : p.Value.GetRawText();
        }
        return dict;
    }
}