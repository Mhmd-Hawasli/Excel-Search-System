using System.Text.Json;
using ExcelArchive.Application.DTOs.ExcelDto;
using ExcelArchive.Application.DTOs.FileDto;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Records;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Application.Common;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Domain.Text;
using FileEntity = ExcelArchive.Domain.Entities.File;

namespace ExcelArchive.Application.Services;

public class FileService(IUnitOfWork uow, IActivityService activity, IColumnOrderService columns, IHeaderMappingValidator headers) : IFileService
{
    public async Task<(bool Available, string? Error)> CheckNameAsync(string name, CancellationToken ct = default)
    {
        if (await uow.Files.NameExistsAsync(name.Trim(), ct))
            return (false, "اسم الملف مستخدم مسبقًا. اختر اسمًا آخر.");
        return (true, null);
    }

    public async Task<FileDto?> GetAsync(Guid fileId, CancellationToken ct = default)
    {
        var row = await uow.Files.FindWithGroupAsync(fileId, ct);
        return row is null ? null : new FileDto(row.Id, row.GroupId, row.Name, row.Description,
            row.OriginalFilename, row.SheetName, row.RowCount, row.ColumnSignature, row.Version,
            row.UploadedAt, row.UpdatedAt, row.Group.Name, row.Columns.Count);
    }

    public async Task<FileMappingDto?> GetMappingAsync(Guid fileId, CancellationToken ct = default)
    {
        var file = await uow.Files.FindWithColumnsAsync(fileId, ct);
        if (file is null) return null;
        return new FileMappingDto(file.Id, file.Name, file.Columns.Select(c =>
            new FileColumnDto(c.Id, c.HeaderRaw, c.HeaderNormalized, c.ColumnIndex,
                c.StandardField.HasValue ? StandardFieldKeys.Key(c.StandardField.Value) : null,
                c.CategoryId, c.Category?.Name)).ToList());
    }

    public async Task<FileDetailDto?> GetDetailAsync(Guid fileId, bool includeEdits, CancellationToken ct = default)
    {
        var file = await uow.Files.FindWithColumnsAsync(fileId, ct);
        if (file is null) return null;
        var quality = await uow.DataQuality.CountByFileAsync(fileId, ct);
        var edits = includeEdits ? await uow.RecordEdits.CountByFileAsync(fileId, ct) : 0;
        var dto = new FileDto(file.Id, file.GroupId, file.Name, file.Description,
            file.OriginalFilename, file.SheetName, file.RowCount, file.ColumnSignature, file.Version,
            file.UploadedAt, file.UpdatedAt, file.Group.Name, file.Columns.Count);
        var columns = file.Columns.Select(c => new FileColumnDto(c.Id, c.HeaderRaw, c.HeaderNormalized,
            c.ColumnIndex, c.StandardField.HasValue ? StandardFieldKeys.Key(c.StandardField.Value) : null,
            c.CategoryId, c.Category?.Name)).ToList();
        return new FileDetailDto(dto, columns, quality, edits);
    }

    public async Task<FileQualityDto?> GetQualityAsync(Guid fileId, CancellationToken ct = default)
    {
        var file = await uow.Files.FindAsync(fileId, ct);
        if (file is null) return null;
        var issues = await uow.DataQuality.ListByFileAsync(fileId, ct);
        var counts = Enum.GetValues<DataQualityIssueType>()
            .Select(t => new QualityTypeCount(ToIssueKey(t), issues.LongCount(i => i.IssueType == t)))
            .ToList();
        return new FileQualityDto(file.Id, file.Name, file.RowCount, counts,
            issues.Select(i => new QualityIssueDto(i.RowIndex, ToIssueKey(i.IssueType), i.ColumnName, i.RawValue)).ToList());
    }

    private static string ToIssueKey(DataQualityIssueType type) => type switch
    {
        DataQualityIssueType.MissingNationalId => "MISSING_NATIONAL_ID",
        DataQualityIssueType.InvalidNationalId => "INVALID_NATIONAL_ID",
        DataQualityIssueType.DuplicateNationalId => "DUPLICATE_NATIONAL_ID",
        DataQualityIssueType.InvalidPhone => "INVALID_PHONE",
        DataQualityIssueType.InvalidShamCash => "INVALID_SHAM_CASH",
        DataQualityIssueType.InvalidFunctionalCategory => "INVALID_FUNCTIONAL_CATEGORY",
        DataQualityIssueType.EmptyRow => "EMPTY_ROW",
        _ => type.ToString().ToUpperInvariant(),
    };

    /// <summary>Full remap: ownership + dup + category validation, global sort
    /// orders, shadow + quality rebuild for every record, activity. Mirrors V1
    /// update-mapping-service.ts; returns the updated record count.</summary>
    public async Task<int> UpdateMappingAsync(Guid fileId, UpdateMappingRequest request, string actorUsername, CancellationToken ct = default)
    {
        var file = await uow.Files.FindWithColumnsAsync(fileId, ct)
            ?? throw new KeyNotFoundException("الملف غير موجود.");
        if (request.Columns.Count != file.Columns.Count)
            throw new InvalidDataException("عدد الأعمدة المرسلة لا يطابق عدد أعمدة الملف.");
        var byId = file.Columns.ToDictionary(c => c.Id);
        var patches = new List<(FileColumn Column, StandardField? Field, Guid? CategoryId)>();
        var seen = new HashSet<StandardField>();
        foreach (var item in request.Columns)
        {
            if (!byId.TryGetValue(item.Id, out var column))
                throw new InvalidDataException("أحد الأعمدة لا ينتمي لهذا الملف.");
            StandardField? field = null;
            var raw = item.StandardField?.Trim() ?? "";
            if (raw.Length > 0)
            {
                field = StandardFieldKeys.Parse(raw)
                    ?? throw new InvalidDataException($"حقل قياسي غير معروف: {item.StandardField}");
                if (!seen.Add(field.Value))
                    throw new InvalidDataException("لا يمكن ربط حقل قياسي واحد بأكثر من عمود.");
            }
            patches.Add((column, field, item.CategoryId));
        }
        var categoryIds = patches.Select(p => p.CategoryId).Where(g => g.HasValue).Select(g => g!.Value).Distinct().ToList();
        if (categoryIds.Count > 0 && await uow.Categories.CountAsync(c => categoryIds.Contains(c.Id), ct) != categoryIds.Count)
            throw new InvalidDataException("إحدى الفئات غير موجودة.");

        foreach (var (column, field, categoryId) in patches)
        {
            column.StandardField = field;
            column.CategoryId = categoryId;
        }
        var orders = await columns.AssignAsync(
            patches.Select(p => (p.CategoryId, p.Field)).ToList(), ct);
        for (var i = 0; i < patches.Count; i++)
            patches[i].Column.SortOrder = orders[i];
        await uow.SaveChangesAsync(ct);

        // Rebuild shadows + non-empty quality issues for every record (500/page).
        var stale = await uow.DataQuality.ListNonEmptyByFileAsync(fileId, ct);
        uow.DataQuality.RemoveRange(stale);
        await uow.SaveChangesAsync(ct);
        const int Page = 500;
        var seenNational = new HashSet<string>(StringComparer.Ordinal);
        var total = 0;
        int? lastRow = null;
        while (true)
        {
            var batch = await uow.Records.ListBatchesByFileAsync(fileId, lastRow, Page, ct);
            if (batch.Count == 0) break;
            var issues = new List<DataQualityIssue>();
            foreach (var record in batch)
            {
                var data = record.Data is null || record.Data.RootElement.ValueKind != JsonValueKind.Object
                    ? new Dictionary<string, string>()
                    : record.Data.RootElement.EnumerateObject().ToDictionary(
                        p => p.Name,
                        p => p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() ?? "" : p.Value.ToString());
                var byField = new Dictionary<StandardField, string?>();
                foreach (var column in file.Columns)
                {
                    if (!column.StandardField.HasValue) continue;
                    data.TryGetValue(column.HeaderRaw, out var v);
                    byField[column.StandardField.Value] = v ?? "";
                }
                RecordShadowMapper.Clear(record);
                RecordShadowMapper.Apply(record, byField);
                var fields = file.Columns
                    .Where(c => c.StandardField.HasValue)
                    .ToDictionary(
                        c => c.StandardField!.Value,
                        c => (c.HeaderRaw, Value: data.TryGetValue(c.HeaderRaw, out var v) ? v ?? "" : ""));
                issues.AddRange(RecordQualityChecker.CheckRow(fileId, record.RowIndex, fields, rowHasValue: true));
                var nationalRaw = fields.TryGetValue(StandardField.NationalId, out var n) ? n.Value : "";
                if (ArabicNormalizer.NationalIdIssue(nationalRaw) is null)
                {
                    var digits = ArabicNormalizer.NationalIdDigits(nationalRaw)!;
                    if (!seenNational.Add(digits))
                        issues.Add(new DataQualityIssue
                        {
                            FileId = fileId, RowIndex = record.RowIndex,
                            IssueType = DataQualityIssueType.DuplicateNationalId,
                            ColumnName = "الرقم الوطني", RawValue = nationalRaw,
                        });
                }
                total++;
            }
            await uow.SaveChangesAsync(ct);
            if (issues.Count > 0)
            {
                uow.DataQuality.AddRange(issues);
                await uow.SaveChangesAsync(ct);
            }
            lastRow = batch[^1].RowIndex;
            if (batch.Count < Page) break;
        }
        await activity.WriteAsync(ActivityAction.FileUpdated, file.Name,
            new { fileId, mappingUpdated = true, columns = patches.Count, recordsUpdated = total }, ct);
        return total;
    }

    public async Task DeleteAsync(Guid fileId, string confirmName, string actorUsername, CancellationToken ct = default)
    {
        var file = await uow.Files.FindAsync(fileId, ct)
            ?? throw new KeyNotFoundException("الملف غير موجود.");
        if (confirmName != file.Name) throw new InvalidOperationException("اسم التأكيد لا يطابق اسم الملف.");
        var groupId = file.GroupId;
        var rowCount = file.RowCount;
        uow.Files.Remove(file);
        await uow.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.FileDeleted, file.Name,
            new { fileId, records = rowCount, by = actorUsername }, ct);
    }

    /// <summary>Moves a file (and its records/edits/version) to another group.
    /// Name uniqueness is global, so only the GroupId changes.</summary>
    public async Task MoveAsync(Guid fileId, Guid targetGroupId, string actorUsername, CancellationToken ct = default)
    {
        var file = await uow.Files.FindAsync(fileId, ct)
            ?? throw new KeyNotFoundException("الملف غير موجود.");
        if (targetGroupId == file.GroupId)
            throw new InvalidOperationException("الملف موجود بالفعل في هذه المجموعة.");
        var target = await uow.Groups.FindAsync(targetGroupId, ct)
            ?? throw new KeyNotFoundException("المجموعة الجديدة غير موجودة.");
        var name = file.Name;
        await uow.ExecuteInTransactionAsync(async () =>
        {
            file.GroupId = targetGroupId;
            file.UpdatedAt = DateTime.UtcNow;
            await uow.SaveChangesAsync(ct);
            await activity.WriteAsync(ActivityAction.FileUpdated, name,
                new { fileId, movedToGroupId = targetGroupId, movedToGroupName = target.Name, by = actorUsername }, ct);
        }, ct);
    }

    public async Task<bool> ExistsAsync(Guid fileId, CancellationToken ct = default)
        => await uow.Files.FindAsync(fileId, ct) is not null;

    public async Task<FileExportDataDto?> GetExportDataAsync(Guid fileId, CancellationToken ct = default)
    {
        var file = await uow.Files.FindWithColumnsAsync(fileId, ct);
        if (file is null) return null;
        // Unbounded full-file materialization OOMs on very large files;
        // refuse with a clear 413 instead of crashing the worker.
        const int MaxExportRows = 100_000;
        if (file.RowCount > MaxExportRows)
            throw new InvalidOperationException(
                $"حجم الملف ({file.RowCount} صف) يتجاوز حد التصدير المباشر ({MaxExportRows}). قسّم الملف ثم صدّر على دفعات.");
        var records = await uow.Records.ListExportRowsAsync(fileId, ct);
        var edits = await uow.RecordEdits.ListByFileAsync(fileId, ct);
        var nationalHeader = file.Columns
            .FirstOrDefault(c => c.StandardField == StandardField.NationalId)?.HeaderRaw;
        return new FileExportDataDto(
            file.SheetName,
            file.Name,
            file.Columns.Select(c => c.HeaderRaw).ToList(),
            records.Select(r => new ExportRecordDto(
                r.Id, r.RowIndex,
                r.Data is null || r.Data.RootElement.ValueKind != JsonValueKind.Object
                    ? new Dictionary<string, string>()
                    : r.Data.RootElement.EnumerateObject().ToDictionary(
                        p => p.Name,
                        p => p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() ?? ""
                            : p.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ? "" : p.Value.GetRawText()),
                ToHeaderMap(r.FmtFills), ToHeaderMap(r.FmtFontColors),
                r.SfFullName, r.DNationalId ?? r.SfNationalId?.ToString())).ToList(),
            edits.Select(e => new ExportEditDto(
                e.RecordId?.ToString(), e.HeaderRaw, e.OldValue, e.NewValue,
                e.EditedBy, e.CreatedAt)).ToList(),
            nationalHeader);
    }

    private static Dictionary<string, string>? ToHeaderMap(JsonDocument? doc)
    {
        if (doc is null || doc.RootElement.ValueKind != JsonValueKind.Object) return null;
        var map = new Dictionary<string, string>();
        foreach (var prop in doc.RootElement.EnumerateObject())
            if (prop.Value.ValueKind == JsonValueKind.String)
                map[prop.Name] = prop.Value.GetString() ?? "";
        return map.Count > 0 ? map : null;
    }

    public async Task<Guid> CreateReplaceJobAsync(Guid fileId, ReplaceFileRequest request, string actorUsername, CancellationToken ct = default)
    {
        var target = await uow.Files.FindWithColumnsAsync(fileId, ct)
            ?? throw new KeyNotFoundException("الملف المراد تحديثه غير موجود.");
        if (request is null || request.Token is null || request.Token == Guid.Empty
            || string.IsNullOrWhiteSpace(request.OriginalFilename) || request.OriginalFilename.Length > 255
            || string.IsNullOrWhiteSpace(request.SheetName) || request.SheetName.Length > 255
            || request.SheetIndex < 1 || request.TotalRows < 0
            || request.Columns is null || request.Columns.Count == 0
            || (request.Mode != "same" && request.Mode != "different"))
            throw new InvalidDataException("إعدادات الاستبدال غير مكتملة.");
        var mapped = request.Columns.Select(c => new ReplaceColumnDto(
            c.HeaderRaw ?? "", c.HeaderNormalized ?? "", c.ColumnIndex, c.StandardField, c.CategoryId)).ToList();
        if (mapped.Any(c => string.IsNullOrWhiteSpace(c.HeaderRaw) || c.ColumnIndex < 1))
            throw new InvalidDataException("إعدادات الاستبدال غير مكتملة.");
        // Per-cell keep-old choices (preview toggles): meaningful only for the
        // direct (same) update where rows correspond by name/key.
        var keepOld = (request.KeepOldCells ?? []).ToList();
        if (keepOld.Count > 0 && request.Mode != "same")
            throw new InvalidDataException("إعدادات الاستبدال غير مكتملة.");
        if (keepOld.Count > 50000
            || keepOld.Any(k => k.RowIndex < 1
                || string.IsNullOrWhiteSpace(k.HeaderRaw) || k.HeaderRaw.Length > 500
                || (k.MatchKey is not null && k.MatchKey.Length > 64)))
            throw new InvalidDataException("إعدادات الاستبدال غير مكتملة.");
        // Smart name-based structure check (NOT positional): columns are matched
        // by normalized header name. Added/reordered columns keep the direct
        // update path; only REMOVED columns require the alternate-version path.
        var newByNormalized = new Dictionary<string, ReplaceColumnDto>(StringComparer.Ordinal);
        foreach (var c in mapped)
        {
            if (newByNormalized.ContainsKey(c.HeaderNormalized ?? ""))
                throw new InvalidDataException("إعدادات الاستبدال غير مكتملة.");
            newByNormalized[c.HeaderNormalized ?? ""] = c;
        }
        if (request.Mode == "same"
            && target.Columns.Any(c => !newByNormalized.ContainsKey(c.HeaderNormalized)))
            throw new ConflictException("تغيرت بنية الأعمدة؛ يجب إنشاء إصدار بديل مع ربط جديد.");
        if (request.Mode == "same")
        {
            // Same structure inherits the target's field/category mapping by
            // column NAME, so inserted/reordered columns don't break the link.
            // Brand-new columns keep the mapping sent by the wizard.
            var targetByNormalized = target.Columns.ToDictionary(c => c.HeaderNormalized);
            mapped = mapped.Select(c => targetByNormalized.TryGetValue(c.HeaderNormalized ?? "", out var t)
                ? c with
                {
                    StandardField = t.StandardField is null
                        ? null : StandardFieldKeys.Key(t.StandardField.Value),
                    CategoryId = t.CategoryId,
                }
                : c).ToList();
        }
        var seen = new HashSet<string>();
        foreach (var c in mapped)
        {
            if (c.StandardField is null) continue;
            if (StandardFieldKeys.Parse(c.StandardField) is null)
                throw new InvalidDataException("إعدادات الاستبدال غير مكتملة.");
            if (!seen.Add(c.StandardField))
                throw new InvalidDataException("لا يمكن ربط حقل قياسي واحد بأكثر من عمود.");
        }
        if (request.LinkedSheets is not null)
        {
            if (request.LinkedSheets.SheetNames.Count == 0
                || request.LinkedSheets.SheetNames.Distinct(StringComparer.Ordinal).Count() != request.LinkedSheets.SheetNames.Count
                || request.LinkedSheets.NationalIdColumnIndex < 1)
                throw new InvalidDataException("إعدادات الاستبدال غير مكتملة.");
            var inspected = mapped.Select(c => new InspectedColumn(
                c.HeaderRaw, c.HeaderNormalized, c.ColumnIndex, c.StandardField, null)).ToList();
            var linkingError = headers.LinkedMappingError(
                request.SheetName, request.SheetIndex,
                request.LinkedSheets.SheetNames, request.LinkedSheets.NationalIdColumnIndex, inspected);
            if (linkingError is not null) throw new InvalidDataException(linkingError);
        }
        var categoryIds = mapped.Select(c => c.CategoryId).Where(g => g.HasValue).Select(g => g!.Value).Distinct().ToList();
        if (categoryIds.Count > 0 && await uow.Categories.CountAsync(c => categoryIds.Contains(c.Id), ct) != categoryIds.Count)
            throw new InvalidDataException("توجد فئة لم تعد متاحة.");
        // Stage into a temporary file first; the worker promotes atomically.
        // Old data stays intact until promotion succeeds (docs/07.4).
        var temporaryName = "مؤقت-" + Guid.NewGuid();
        var job = new ExcelArchive.Domain.Entities.UploadJob
        {
            Status = ExcelArchive.Domain.Enums.UploadJobStatus.Pending,
            TotalRows = Math.Max(0, request.TotalRows),
            StartedAt = DateTime.UtcNow,
            Payload = JsonSerializer.SerializeToDocument(new
            {
                token = request.Token,
                groupId = target.GroupId,
                name = temporaryName,
                description = target.Description,
                originalFilename = request.OriginalFilename,
                sheetName = request.SheetName,
                sheetIndex = request.SheetIndex,
                totalRows = Math.Max(0, request.TotalRows),
                columnSignature = request.ColumnSignature ?? target.ColumnSignature,
                columns = mapped.Select(c => new
                {
                    headerRaw = c.HeaderRaw,
                    headerNormalized = c.HeaderNormalized,
                    columnIndex = c.ColumnIndex,
                    standardField = c.StandardField,
                    categoryId = c.CategoryId,
                }),
                mode = "replace",
                fileId = target.Id,
                replaceMode = request.Mode,
                requestedBy = actorUsername,
                keepOldCells = keepOld.Select(k => new
                {
                    rowIndex = k.RowIndex,
                    headerRaw = k.HeaderRaw,
                    matchKey = k.MatchKey,
                }),
                linkedSheets = request.LinkedSheets is null ? null : new
                {
                    sheetNames = request.LinkedSheets.SheetNames,
                    nationalIdColumnIndex = request.LinkedSheets.NationalIdColumnIndex,
                },
            }),
        };
        uow.UploadJobs.Add(job);
        await uow.SaveChangesAsync(ct);
        return job.Id;
    }

    /// <summary>Manual version bump (N → N+1) with a required note describing
    /// WHAT changed. Live manual edits of the current version are archived
    /// (kept in history with their version stamp) so the new version starts
    /// clean. The ONLY writer of files.version besides replace promotion.</summary>
    public async Task<BumpVersionResponse> BumpVersionAsync(Guid fileId, string? note, string actorUsername, CancellationToken ct = default)
    {
        var trimmed = (note ?? "").Trim();
        if (trimmed.Length < 2 || trimmed.Length > 2000)
            throw new InvalidDataException("اكتب رسالة الإصدار: ما التغيرات التي حصلت؟ (حرفان على الأقل).");
        var file = await uow.Files.FindAsync(fileId, ct)
            ?? throw new KeyNotFoundException("الملف غير موجود.");
        var previous = file.Version;
        var archived = 0;
        await uow.ExecuteInTransactionAsync(async () =>
        {
            // Archive live MANUAL edits of the current version: they stay
            // visible in history stamped with it, while the new version
            // starts clean. Bulk-audit rows of the current version belong to
            // it and are archived along (they are history, not pending).
            var live = await uow.RecordEdits.ListAsync(e => e.FileId == fileId && e.RecordId != null, ct);
            foreach (var edit in live)
            {
                edit.FileVersion = previous;
                edit.RecordId = null;
                edit.FileColumnId = null;
            }
            archived = live.Count(e => !e.IsBulk);
            await uow.SaveChangesAsync(ct);
            file.Version = previous + 1;
            file.UpdatedAt = DateTime.UtcNow;
            await uow.SaveChangesAsync(ct);
            uow.FileVersions.Add(new FileVersion
            {
                FileId = fileId,
                Version = file.Version,
                Note = trimmed,
                Kind = "manual",
                CreatedBy = actorUsername,
            });
            await uow.SaveChangesAsync(ct);
        }, ct);
        await activity.WriteAsync(ActivityAction.FileVersionBumped, file.Name,
            new { fileId, previousVersion = previous, newVersion = file.Version, archivedEdits = archived, note = trimmed, by = actorUsername }, ct);
        return new BumpVersionResponse(fileId, previous, file.Version, archived);
    }

    /// <summary>Reconstructs the file as it was at the end of the given
    /// version by rewinding the current values through the edit log: every
    /// cell's earliest edit NEWER than the target version yields its OldValue.
    /// Rows are resolved by live record id first, then by stable national id.
    /// Limitation: rows added/removed by later updates cannot be resurrected
    /// from cell edits, so those appear as of the current row set.</summary>
    public async Task<FileExportDataDto?> GetVersionExportDataAsync(Guid fileId, int version, CancellationToken ct = default)
    {
        var file = await uow.Files.FindWithColumnsAsync(fileId, ct);
        if (file is null) return null;
        if (version < 1 || version > file.Version)
            throw new InvalidDataException($"رقم الإصدار غير صالح. الإصدارات المتاحة من 1 إلى {file.Version}.");
        if (version == file.Version)
            return await GetExportDataAsync(fileId, ct);
        const int MaxExportRows = 100_000;
        if (file.RowCount > MaxExportRows)
            throw new InvalidOperationException(
                $"حجم الملف ({file.RowCount} صف) يتجاوز حد التصدير المباشر ({MaxExportRows}). قسّم الملف ثم صدّر على دفعات.");
        var headers = file.Columns.Select(c => c.HeaderRaw).ToList();
        var headerSet = new HashSet<string>(headers, StringComparer.Ordinal);
        var records = await uow.Records.ListExportRowsAsync(fileId, ct);
        var edits = await uow.RecordEdits.ListByFileAsync(fileId, ct);
        var byId = records.ToDictionary(r => r.Id);
        var byNational = new Dictionary<string, Domain.Entities.Record>(StringComparer.Ordinal);
        foreach (var r in records)
            if (r.DNationalId is not null)
                byNational.TryAdd(r.DNationalId, r);
        var data = records.ToDictionary(r => r.Id, r => CellMap(r.Data));
        var rewound = new HashSet<(Guid, string)>();
        foreach (var e in edits
                     .Where(e => e.FileVersion > version)
                     .OrderBy(e => e.FileVersion)
                     .ThenBy(e => e.CreatedAt))
        {
            Domain.Entities.Record? target = null;
            if (e.RecordId.HasValue)
                byId.TryGetValue(e.RecordId.Value, out target);
            if (target is null && !string.IsNullOrWhiteSpace(e.NationalId))
                byNational.TryGetValue(e.NationalId, out target);
            if (target is null || !headerSet.Contains(e.HeaderRaw)) continue;
            if (!rewound.Add((target.Id, e.HeaderRaw))) continue;
            data[target.Id][e.HeaderRaw] = e.OldValue ?? "";
        }
        var nationalHeader = file.Columns
            .FirstOrDefault(c => c.StandardField == StandardField.NationalId)?.HeaderRaw;
        return new FileExportDataDto(
            file.SheetName,
            file.Name,
            headers,
            records.Select(r => new ExportRecordDto(
                r.Id, r.RowIndex,
                data[r.Id],
                ToHeaderMap(r.FmtFills), ToHeaderMap(r.FmtFontColors),
                r.SfFullName, r.DNationalId ?? r.SfNationalId?.ToString())).ToList(),
            edits
                .Where(e => e.FileVersion <= version)
                .Select(e => new ExportEditDto(
                    e.RecordId?.ToString(), e.HeaderRaw, e.OldValue, e.NewValue,
                    e.EditedBy, e.CreatedAt)).ToList(),
            nationalHeader);
    }

    private static Dictionary<string, string> CellMap(JsonDocument? doc)
    {
        if (doc is null || doc.RootElement.ValueKind != JsonValueKind.Object)
            return new Dictionary<string, string>(StringComparer.Ordinal);
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var prop in doc.RootElement.EnumerateObject())
            map[prop.Name] = prop.Value.ValueKind == JsonValueKind.String ? prop.Value.GetString() ?? ""
                : prop.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ? "" : prop.Value.GetRawText();
        return map;
    }

    /// <summary>Version history newest-first plus the live (pending) manual
    /// edit count on the current version. Missing rows (files predating the
    /// history table) are backfilled as seed entries.</summary>
    public async Task<FileVersionsResponse?> GetVersionsAsync(Guid fileId, CancellationToken ct = default)
    {
        var file = await uow.Files.FindAsync(fileId, ct);
        if (file is null) return null;
        var existing = await uow.FileVersions.ListByFileAsync(fileId, ct);
        var have = new HashSet<int>(existing.Select(v => v.Version));
        var missing = new List<FileVersion>();
        for (var v = 1; v <= file.Version; v++)
        {
            if (have.Contains(v)) continue;
            missing.Add(new FileVersion
            {
                FileId = fileId,
                Version = v,
                Note = v == 1 ? "الإصدار الأول عند رفع الملف." : "إصدار سابق محفوظ قبل تفعيل سجل الإصدارات.",
                Kind = "seed",
            });
        }
        if (missing.Count > 0)
        {
            uow.FileVersions.AddRange(missing);
            await uow.SaveChangesAsync(ct);
            existing = await uow.FileVersions.ListByFileAsync(fileId, ct);
        }
        var edits = await uow.RecordEdits.ListAsync(e => e.FileId == fileId, ct);
        var counts = edits.GroupBy(e => e.FileVersion).ToDictionary(g => g.Key, g => (long)g.Count());
        var pending = edits.Count(e => e.RecordId != null && !e.IsBulk);
        var versions = existing
            .OrderByDescending(v => v.Version)
            .Select(v => new FileVersionDto(v.Id, v.FileId, v.Version, v.Note, v.Kind,
                v.CreatedBy, v.CreatedAt, counts.TryGetValue(v.Version, out var c) ? c : 0))
            .ToList();
        return new FileVersionsResponse(fileId, file.Version, pending, versions);
    }
}
