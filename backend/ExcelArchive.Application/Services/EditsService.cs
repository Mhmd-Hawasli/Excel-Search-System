using System.Text.Json;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.EditDto;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Records;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Text;
using ExcelArchive.Application.Interfaces.Services;

namespace ExcelArchive.Application.Services;

/// <summary>V1 lib/edits/service.ts port: original vs current vs previous
/// history values, no-op without audit, server-derived revert, shadow/quality
/// sync, targeted duplicate repair, RECORD_EDITED / RECORD_VISITED activity.
/// Docs 05 A15-A18, 07.5.</summary>
public class EditsService(IUnitOfWork uow, IActivityService activity) : IEditsService
{
    private sealed record EditPerson(Guid Id, string? Full, string? First, string? Father, string? Last, int RowIndex)
    {
        public string DisplayName()
        {
            if (!string.IsNullOrWhiteSpace(Full)) return Full;
            var joined = string.Join(" ", new[] { First, Father, Last }.Where(s => !string.IsNullOrWhiteSpace(s)));
            return joined.Length > 0 ? joined : "سجل بدون اسم";
        }
    }

    public async Task<IReadOnlyList<EditedFileSummary>> SummaryAsync(DataScopeDto scope, CancellationToken ct = default)
    {
        var rows = await uow.RecordEdits.SummaryAsync(scope.FileIds, ct);

        var fileIds = rows.Select(r => r.FileId).ToList();
        var files = await uow.Files.ListWithGroupByIdsAsync(fileIds, ct);
        return rows.Select(r =>
        {
            var file = files.FirstOrDefault(f => f.Id == r.FileId);
            return new EditedFileSummary(r.FileId, file?.Name ?? "", file?.GroupId ?? Guid.Empty,
                file?.Group.Name ?? "", r.Count, r.Last, file?.Version ?? 1);
        }).ToList();
    }

    public async Task<EditsResult> ListAsync(Guid? fileId, DataScopeDto scope, int page, int pageSize,
        string? person = null, string? column = null, string? oldValue = null,
        string? newValue = null, int? version = null, string? fromDate = null,
        string? toDate = null, string? user = null, string? sortBy = null,
        string? sortDir = "desc", IReadOnlyList<string>? columns = null,
        IReadOnlyList<string>? users = null, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var (rows, total) = await uow.RecordEdits.ListPagedAsync(fileId, scope.FileIds, page, pageSize, person, column, oldValue, newValue, version, fromDate, toDate, user, sortBy, sortDir, columns, users, ct);
        // Person full name for the history table (V1 UI-12): one lookup for
        // the page, mapped in memory so deleted records stay visible.
        // Archived (previous-version) edits carry a null record id and keep
        // their values visible in history without a person link.
        var recordIds = rows.Where(e => e.RecordId.HasValue).Select(e => e.RecordId!.Value).Distinct().ToList();
        var people = await uow.Records.ListPeopleByIdsAsync(recordIds, ct);
        var byRecord = people.Select(r => new EditPerson(r.Id, r.SfFullName, r.SfFirstName, r.SfFatherName, r.SfLastName, r.RowIndex)).ToDictionary(r => r.Id);
        var liveById = people.ToDictionary(r => r.Id);
        // Stable identity by national ID (not Excel row number, which shifts
        // when rows are deleted): resolves the CURRENT record + current value
        // for every edit, including archived ones whose record was replaced.
        var nationalIds = rows
            .Where(e => !string.IsNullOrWhiteSpace(e.NationalId))
            .Select(e => e.NationalId!)
            .Distinct()
            .ToList();
        var byNational = new Dictionary<(Guid FileId, string National), Record>(rows.Count);
        if (nationalIds.Count > 0)
        {
            foreach (var fid in rows.Select(e => e.FileId).Distinct().ToList())
            {
                ct.ThrowIfCancellationRequested();
                var matches = await uow.Records.ListAsync(
                    r => r.FileId == fid && r.DNationalId != null && nationalIds.Contains(r.DNationalId), ct);
                foreach (var m in matches)
                    byNational.TryAdd((fid, m.DNationalId!), m);
            }
        }
        return new EditsResult(rows.Select(e =>
        {
            byRecord.TryGetValue(e.RecordId ?? Guid.Empty, out var person);
            Record? target = null;
            if (e.RecordId.HasValue)
                liveById.TryGetValue(e.RecordId.Value, out target);
            if (target is null && !string.IsNullOrWhiteSpace(e.NationalId))
                byNational.TryGetValue((e.FileId, e.NationalId), out target);
            string? currentValue = null;
            if (target is not null)
            {
                var data = RowData(target.Data);
                currentValue = data.TryGetValue(e.HeaderRaw, out var v) ? v ?? "" : "";
            }
            return new EditDto(e.Id, e.RecordId, e.FileId, e.FileColumnId,
                e.HeaderRaw, e.OldValue, e.NewValue, e.CreatedAt,
                person?.DisplayName(), person?.RowIndex, e.EditedBy, e.FileVersion,
                e.NationalId, currentValue, target?.Id);
        }).ToList(), total, page, pageSize);
    }

    public async Task<EditOptionsDto> OptionsAsync(Guid fileId, DataScopeDto scope, CancellationToken ct = default)
    {
        if (scope.FileIds is not null && !scope.FileIds.Contains(fileId))
            throw new KeyNotFoundException("غير موجود.");
        var file = await uow.Files.FindAsync(fileId, ct)
            ?? throw new KeyNotFoundException("الملف غير موجود.");
        var columns = await uow.RecordEdits.DistinctHeadersAsync(fileId, ct);
        var editors = await uow.RecordEdits.DistinctEditorsAsync(fileId, ct);
        // Column/user multi-select candidates: everyone who edited this file
        // plus every active system user (a user with zero edits simply yields
        // an empty result when selected).
        var systemUsers = await uow.Users.ListWithPermissionsAsync(ct);
        var displayByUser = new Dictionary<string, string?>(StringComparer.Ordinal);
        foreach (var u in systemUsers.Where(u => u.IsActive))
            displayByUser.TryAdd(u.Username, u.DisplayName);
        var names = editors
            .Concat(displayByUser.Keys)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(n => n, StringComparer.Ordinal)
            .ToList();
        return new EditOptionsDto(
            columns.ToList(),
            names.Select(n => new EditUserOption(n,
                displayByUser.TryGetValue(n, out var d) ? d : null)).ToList(),
            file.Version);
    }

    public async Task<RecordEditsResult> GetRecordEditsAsync(Guid recordId, CancellationToken ct = default)
    {
        var edits = (await uow.RecordEdits.ListByRecordAsync(recordId, ct)).ToList();
        // History survives file replaces: archiving nulls the record link and
        // replacement mints new record ids, so a current record would
        // otherwise show zero history. Resolve archived edits back by stable
        // national id within the same file (mirrors ListAsync above).
        var record = await uow.Records.FindAsync(recordId, ct);
        if (record is not null && !string.IsNullOrWhiteSpace(record.DNationalId))
        {
            var archived = await uow.RecordEdits.ListAsync(
                e => e.FileId == record.FileId && e.RecordId == null && e.NationalId == record.DNationalId, ct);
            var known = new HashSet<Guid>(edits.Select(e => e.Id));
            edits.AddRange(archived.Where(e => known.Add(e.Id)));
        }
        var headers = new Dictionary<string, EditedHeaderDto>(StringComparer.Ordinal);
        foreach (var edit in edits.OrderBy(e => e.CreatedAt))
        {
            if (!headers.TryGetValue(edit.HeaderRaw, out var existing))
                headers[edit.HeaderRaw] = new EditedHeaderDto(1, edit.OldValue, edit.NewValue, edit.CreatedAt, edit.EditedBy);
            else
                headers[edit.HeaderRaw] = existing with
                {
                    Count = existing.Count + 1,
                    LastValue = edit.NewValue,
                    LastAt = edit.CreatedAt,
                    LastBy = edit.EditedBy ?? existing.LastBy,
                };
        }
        return new RecordEditsResult(
            edits.Select(e => new RecordEditInfoDto(e.Id, e.HeaderRaw, e.FileColumnId, e.OldValue, e.NewValue, e.CreatedAt, e.EditedBy)).ToList(),
            headers);
    }

    public async Task<EditResult> SaveAsync(Guid recordId, Guid? fileColumnId, string? headerRaw,
        string newValue, string actorUsername, DataScopeDto scope, CancellationToken ct = default)
    {
        // trim قبل الحفظ (طبقة الخادم هي المرجع): مسافات زائدة لا تُخزَّن ولا تُنشئ سجل تعديل.
        newValue = (newValue ?? "").Trim();
        if (newValue.Length > 5000) throw new InvalidOperationException("القيمة الجديدة طويلة جدًا.");

        var record = await uow.Records.FindWithFileAsync(recordId, ct)
            ?? throw new KeyNotFoundException("السجل غير موجود.");
        if (scope.FileIds is not null && !scope.FileIds.Contains(record.FileId))
            throw new KeyNotFoundException("السجل غير موجود.");

        var columns = await uow.FileColumns.ListByFileAsync(record.FileId, ct);
        var target = fileColumnId.HasValue
            ? columns.FirstOrDefault(c => c.Id == fileColumnId.Value)
            : columns.FirstOrDefault(c => c.HeaderRaw == (headerRaw ?? "").Trim());
        if (target is null) throw new KeyNotFoundException("العمود غير موجود في هذا الملف.");

        var data = RowData(record.Data);
        var oldValue = data.TryGetValue(target.HeaderRaw, out var cur) ? cur ?? "" : "";
        if (oldValue == newValue) return new EditResult(false, oldValue, newValue);

        var nextData = new Dictionary<string, string?>(data, StringComparer.Ordinal) { [target.HeaderRaw] = newValue };
        var byField = ByStandardField(columns, nextData);

        var prevNationalRaw = StandardValue(data, columns, StandardField.NationalId);
        var nextNationalRaw = byField.TryGetValue(StandardField.NationalId, out var nn) ? nn ?? "" : "";
        var prevValidNum = ValidNationalNum(prevNationalRaw);
        var nextValidNum = ValidNationalNum(nextNationalRaw);
        var nationalChanged = !string.Equals(prevNationalRaw, nextNationalRaw, StringComparison.Ordinal);

        // Stable person identity for the history (survives row deletions and
        // file replacements, unlike Excel row numbers).
        string? editNationalId = null;
        var nationalCol = columns.FirstOrDefault(c => c.StandardField == StandardField.NationalId);
        if (nationalCol is not null)
        {
            nextData.TryGetValue(nationalCol.HeaderRaw, out var nationalRaw);
            var norm = ArabicNormalizer.NormalizeNationalId(nationalRaw ?? "");
            editNationalId = string.IsNullOrEmpty(norm) ? null : norm;
        }

        // Single SaveChanges is atomic on relational providers; the unit of
        // work additionally binds an explicit transaction on relational
        // providers only (InMemory has none).
        await uow.ExecuteInTransactionAsync(async () =>
        {
            await ApplyEditAsync();
            await uow.SaveChangesAsync(ct);
        }, ct);

        async Task ApplyEditAsync()
        {
            uow.RecordEdits.Add(new RecordEdit
            {
                RecordId = record.Id,
                FileId = record.FileId,
                FileColumnId = target.Id,
                FileVersion = record.File?.Version ?? 1,
                HeaderRaw = target.HeaderRaw,
                OldValue = oldValue,
                NewValue = newValue,
                EditedBy = actorUsername,
                NationalId = editNationalId,
            });

            // Recompute sf_*/n_*/d_*/nationalIdNum via the shared mapper (V1 buildRecordFieldUpdates).
            record.Data = JsonSerializer.SerializeToDocument(
                nextData.ToDictionary(k => k.Key, k => (string?)k.Value));
            RecordShadowMapper.Clear(record);
            RecordShadowMapper.Apply(record, byField);

            // Rebuild this row's non-duplicate, non-empty issues (V1 singleRowIssues).
            var rebuildable = new[]
            {
                DataQualityIssueType.MissingNationalId, DataQualityIssueType.InvalidNationalId,
                DataQualityIssueType.InvalidPhone, DataQualityIssueType.InvalidShamCash,
                DataQualityIssueType.InvalidFunctionalCategory,
            };
            var stale = await uow.DataQuality.ListRebuildableAsync(record.FileId, record.RowIndex, rebuildable, ct);
            uow.DataQuality.RemoveRange(stale);
            var fieldPairs = columns
                .Where(c => c.StandardField.HasValue)
                .ToDictionary(c => c.StandardField!.Value,
                    c => (c.HeaderRaw, nextData.TryGetValue(c.HeaderRaw, out var v) ? v ?? "" : ""));
            uow.DataQuality.AddRange(RecordQualityChecker.CheckRow(
                record.FileId, record.RowIndex, fieldPairs,
                rowHasValue: nextData.Values.Any(v => !string.IsNullOrWhiteSpace(v))));

            // Targeted duplicate repair when the national value changed (V1 service.ts).
            if (nationalChanged)
            {
                var selfDupes = await uow.DataQuality.ListByFileRowTypeAsync(
                    record.FileId, record.RowIndex, DataQualityIssueType.DuplicateNationalId, ct);
                uow.DataQuality.RemoveRange(selfDupes);
                if (nextValidNum is not null)
                {
                    var others = (await uow.Records.RowIndicesByNationalAsync(record.FileId, nextValidNum.Value, ct))
                        .Where(i => i != record.RowIndex).ToList();
                    if (others.Count > 0)
                    {
                        uow.DataQuality.Add(new DataQualityIssue
                        {
                            FileId = record.FileId,
                            RowIndex = record.RowIndex,
                            IssueType = DataQualityIssueType.DuplicateNationalId,
                            ColumnName = "الرقم الوطني",
                            RawValue = nextNationalRaw,
                        });
                        foreach (var sibling in others)
                        {
                            var exists = await uow.DataQuality.ExistsDupeAsync(record.FileId, sibling, ct);
                            if (!exists)
                            {
                                var sibRec = await uow.Records.FindByFileAndRowAsync(record.FileId, sibling, ct);
                                var sibData = sibRec is null ? new Dictionary<string, string?>() : RowData(sibRec.Data);
                                var sibCols = columns;
                                var sibNational = StandardValue(sibData, sibCols, StandardField.NationalId);
                                uow.DataQuality.Add(new DataQualityIssue
                                {
                                    FileId = record.FileId,
                                    RowIndex = sibling,
                                    IssueType = DataQualityIssueType.DuplicateNationalId,
                                    ColumnName = "الرقم الوطني",
                                    RawValue = sibNational,
                                });
                            }
                        }
                    }
                }
                if (prevValidNum is not null && prevValidNum != nextValidNum)
                {
                    var remaining = await uow.Records.CountByNationalAsync(record.FileId, prevValidNum.Value, ct);
                    if (remaining <= 1)
                    {
                        var leftovers = await uow.Records.RowIndicesByNationalAsync(record.FileId, prevValidNum.Value, ct);
                        foreach (var rowIndex in leftovers)
                        {
                            var doomed = await uow.DataQuality.ListByFileRowTypeAsync(
                                record.FileId, rowIndex, DataQualityIssueType.DuplicateNationalId, ct);
                            uow.DataQuality.RemoveRange(doomed);
                        }
                    }
                }
            }
        }

        // Activity outside the data transaction would hide write failures; V1 logs
        // RECORD_EDITED in the same transaction. Keep a separate insert here only
        // because ActivityService owns its own SaveChanges; failure still surfaces.
        var personName = record.SfFullName
            ?? string.Join(" ", new[] { record.SfFirstName, record.SfFatherName, record.SfLastName }
                .Where(p => !string.IsNullOrWhiteSpace(p)));
        if (string.IsNullOrWhiteSpace(personName)) personName = "سجل بلا اسم";
        // fileName/fileVersion are new additive keys: old RECORD_EDITED rows
        // carry only fileId, and the read path resolves their file context
        // from it — old readers simply ignore unknown keys.
        await activity.WriteAsync(Domain.Enums.ActivityAction.RecordEdited, personName,
            new { fileId = record.FileId, fileName = record.File?.Name, fileVersion = record.File?.Version ?? 1,
                recordId = record.Id, rowIndex = record.RowIndex,
                headerRaw = target.HeaderRaw, oldValue, newValue, editedBy = actorUsername,
                personName }, ct);
        return new EditResult(true, oldValue, newValue);
    }

    public async Task<EditResult> RevertAsync(Guid recordId, Guid? fileColumnId, string? headerRaw,
        string actorUsername, DataScopeDto scope, CancellationToken ct = default)
    {
        var record = await uow.Records.FindAsync(recordId, ct)
            ?? throw new KeyNotFoundException("السجل غير موجود.");
        if (scope.FileIds is not null && !scope.FileIds.Contains(record.FileId))
            throw new KeyNotFoundException("السجل غير موجود.");
        var columns = await uow.FileColumns.ListByFileAsync(record.FileId, ct);
        var target = fileColumnId.HasValue
            ? columns.FirstOrDefault(c => c.Id == fileColumnId.Value)
            : columns.FirstOrDefault(c => c.HeaderRaw == (headerRaw ?? "").Trim());
        if (target is null) throw new KeyNotFoundException("العمود غير موجود في هذا الملف.");
        var latest = await uow.RecordEdits.LatestByRecordAndHeaderAsync(recordId, target.HeaderRaw, ct)
            ?? throw new InvalidOperationException("لا يوجد تعديل للتراجع عنه في هذا الحقل.");
        // Server-derived previous value; retained as a new audit entry via SaveAsync.
        return await SaveAsync(recordId, latest.FileColumnId ?? target.Id, target.HeaderRaw,
            latest.OldValue, actorUsername, scope, ct);
    }

    public async Task VisitAsync(Guid recordId, CurrentUserDto user, DataScopeDto scope, CancellationToken ct = default)
    {
        var record = await uow.Records.FindReadOnlyAsync(recordId, ct)
            ?? throw new KeyNotFoundException("غير موجود.");
        if (scope.FileIds is not null && !scope.FileIds.Contains(record.FileId))
            throw new KeyNotFoundException("غير موجود.");
        // Audit de-duplication: repeated views of the same record by the same
        // visitor within 5 minutes share one audit row instead of spamming
        // activity_log (storage DoS + noisy audit trail).
        if (await uow.ActivityLogs.ExistsRecentVisitAsync(
                recordId, user.Username, DateTime.UtcNow.AddMinutes(-5), ct))
            return;
        var name = record.SfFullName
            ?? string.Join(" ", new[] { record.SfFirstName, record.SfFatherName, record.SfLastName }
                .Where(p => !string.IsNullOrWhiteSpace(p)));
        if (string.IsNullOrWhiteSpace(name)) name = "سجل بلا اسم";
        await activity.WriteAsync(Domain.Enums.ActivityAction.RecordVisited, name,
            new
            {
                recordId = record.Id,
                rowIndex = record.RowIndex,
                fileId = record.FileId,
                fileName = record.File.Name,
                groupId = record.File.GroupId,
                personName = name,
                visitorUsername = user.Username,
                visitorDisplayName = user.DisplayName ?? user.Username,
            }, ct);
    }

    private static Dictionary<string, string?> RowData(JsonDocument? doc)
    {
        if (doc is null || doc.RootElement.ValueKind != JsonValueKind.Object)
            return new Dictionary<string, string?>(StringComparer.Ordinal);
        var result = new Dictionary<string, string?>(StringComparer.Ordinal);
        foreach (var p in doc.RootElement.EnumerateObject())
            result[p.Name] = p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString()
                : p.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ? ""
                : p.Value.GetRawText();
        return result;
    }

    private static Dictionary<StandardField, string?> ByStandardField(
        IReadOnlyList<FileColumn> columns, IReadOnlyDictionary<string, string?> data)
    {
        var map = new Dictionary<StandardField, string?>();
        foreach (var c in columns)
            if (c.StandardField.HasValue)
                map[c.StandardField.Value] = data.TryGetValue(c.HeaderRaw, out var v) ? v ?? "" : "";
        return map;
    }

    private static string StandardValue(IReadOnlyDictionary<string, string?> data,
        IReadOnlyList<FileColumn> columns, StandardField field)
    {
        var col = columns.FirstOrDefault(c => c.StandardField == field);
        if (col is null) return "";
        return data.TryGetValue(col.HeaderRaw, out var v) ? v ?? "" : "";
    }

    private static long? ValidNationalNum(string raw)
    {
        if (ArabicNormalizer.NationalIdIssue(raw) is not null) return null;
        var digits = ArabicNormalizer.NationalIdDigits(raw);
        if (digits is null) return null;
        try
        {
            var num = long.Parse(digits);
            return num <= 9223372036854775807L ? num : null;
        }
        catch { return null; }
    }
}
