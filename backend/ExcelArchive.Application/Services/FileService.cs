using System.Security.Cryptography;
using System.Text;
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
        var quality = await uow.DataQuality.CountByFileAsync(fileId, ct)
            + (await DuplicateQualityIssuesAsync(fileId, file.Columns, ct)).Count;
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
        var file = await uow.Files.FindWithColumnsAsync(fileId, ct);
        if (file is null) return null;
        var issues = await uow.DataQuality.ListByFileAsync(fileId, ct);
        var duplicateIssues = await DuplicateQualityIssuesAsync(fileId, file.Columns, ct);
        var counts = Enum.GetValues<DataQualityIssueType>()
            .Select(t => new QualityTypeCount(ToIssueKey(t), issues.LongCount(i => i.IssueType == t)))
            .ToList();
        counts.Add(new QualityTypeCount("DUPLICATE_SHAM_CASH",
            duplicateIssues.LongCount(i => i.IssueType == "DUPLICATE_SHAM_CASH")));
        counts.Add(new QualityTypeCount("DUPLICATE_FULL_NAME_MOTHER",
            duplicateIssues.LongCount(i => i.IssueType == "DUPLICATE_FULL_NAME_MOTHER")));
        return new FileQualityDto(file.Id, file.Name, file.RowCount, counts,
            issues.Select(i => new QualityIssueDto(i.RowIndex, ToIssueKey(i.IssueType), i.ColumnName, i.RawValue))
                .Concat(duplicateIssues).OrderBy(i => i.RowIndex).ToList());
    }

    private async Task<List<QualityIssueDto>> DuplicateQualityIssuesAsync(
        Guid fileId, IEnumerable<FileColumn> columns, CancellationToken ct)
    {
        var sham = columns.FirstOrDefault(c => c.StandardField == StandardField.ShamCash)?.HeaderRaw;
        var full = columns.FirstOrDefault(c => c.StandardField == StandardField.FullName)?.HeaderRaw;
        var first = columns.FirstOrDefault(c => c.StandardField == StandardField.FirstName)?.HeaderRaw;
        var father = columns.FirstOrDefault(c => c.StandardField == StandardField.FatherName)?.HeaderRaw;
        var last = columns.FirstOrDefault(c => c.StandardField == StandardField.LastName)?.HeaderRaw;
        var mother = columns.FirstOrDefault(c => c.StandardField == StandardField.MotherName)?.HeaderRaw;
        if (sham is null && (mother is null || (full is null && first is null))) return [];
        var shamRows = new Dictionary<string, List<(int Row, string Raw)>>(StringComparer.Ordinal);
        var personRows = new Dictionary<string, List<(int Row, string Raw)>>(StringComparer.Ordinal);
        foreach (var record in await uow.Records.ListExportRowsAsync(fileId, ct))
        {
            ct.ThrowIfCancellationRequested();
            if (record.Data?.RootElement.ValueKind != JsonValueKind.Object) continue;
            var data = record.Data.RootElement;
            string Value(string? header) => header is not null && data.TryGetProperty(header, out var v)
                ? v.ToString().Trim() : "";
            if (sham is not null)
            {
                var raw = Value(sham);
                var key = ShamCash.Normalize(raw);
                if (key is not null)
                {
                    if (!shamRows.TryGetValue(key, out var rows)) shamRows[key] = rows = [];
                    rows.Add((record.RowIndex, raw));
                }
            }
            if (mother is not null)
            {
                var name = full is not null ? Value(full)
                    : string.Join(" ", new[] { Value(first), Value(father), Value(last) }
                        .Where(s => s.Length > 0));
                var motherName = Value(mother);
                var nameKey = ArabicNormalizer.NormalizeStored(name);
                var motherKey = ArabicNormalizer.NormalizeStored(motherName);
                if (nameKey.Length > 0 && motherKey.Length > 0)
                {
                    var key = nameKey + "\u001f" + motherKey;
                    if (!personRows.TryGetValue(key, out var rows)) personRows[key] = rows = [];
                    rows.Add((record.RowIndex, name + " | " + motherName));
                }
            }
        }
        var result = new List<QualityIssueDto>();
        foreach (var rows in shamRows.Values.Where(r => r.Count > 1))
            result.AddRange(rows.Select(r => new QualityIssueDto(r.Row, "DUPLICATE_SHAM_CASH", sham, r.Raw)));
        foreach (var rows in personRows.Values.Where(r => r.Count > 1))
            result.AddRange(rows.Select(r => new QualityIssueDto(r.Row, "DUPLICATE_FULL_NAME_MOTHER", "الاسم الثلاثي واسم الأم", r.Raw)));
        return result;
    }

    /// <summary>SHA-256 hex over unit-separator-joined normalized headers in
    /// ColumnIndex order — mirrors HeaderEngine.ColumnSignature without taking
    /// an Infrastructure dependency (Application must not reference it).</summary>
    private static string ComputeColumnSignature(IEnumerable<FileColumn> columns)
    {
        var joined = string.Join(((char)0x1F).ToString(),
            columns.OrderBy(c => c.ColumnIndex).Select(c => ArabicNormalizer.NormalizeStored(c.HeaderRaw)));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(joined))).ToLowerInvariant();
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
    /// update-mapping-service.ts; returns the updated record count.
    /// Changing the pk key (PkColumnId) destroys every stored record of the
    /// file and is applied only with ConfirmPkChange.</summary>
    public async Task<int> UpdateMappingAsync(Guid fileId, UpdateMappingRequest request, string actorUsername, CancellationToken ct = default)
    {
        var file = await uow.Files.FindWithColumnsAsync(fileId, ct)
            ?? throw new KeyNotFoundException("الملف غير موجود.");
        if (request.Columns.Count != file.Columns.Count)
            throw new InvalidDataException("عدد الأعمدة المرسلة لا يطابق عدد أعمدة الملف.");
        var byId = file.Columns.ToDictionary(c => c.Id);
        var currentPk = file.Columns.FirstOrDefault(c =>
            string.Equals(c.HeaderRaw, "pk", StringComparison.OrdinalIgnoreCase));

        // pk change detection: an explicit PkColumnId different from the
        // current key column means the user re-designated the key.
        FileColumn? newPk = null;
        var pkChanged = false;
        if (request.PkColumnId.HasValue)
        {
            if (request.PkColumnId.Value == Guid.Empty)
                throw new InvalidDataException("يجب تحديد عمود مفتاح الربط الرئيسي.");
            if (!byId.TryGetValue(request.PkColumnId.Value, out newPk))
                throw new InvalidDataException("عمود مفتاح الربط المحدد لا ينتمي لهذا الملف.");
            if (currentPk is null || newPk.Id != currentPk.Id)
            {
                pkChanged = true;
                if (!request.ConfirmPkChange)
                    throw new InvalidDataException("تغيير مفتاح الربط الرئيسي سيحذف جميع السجلات التابعة لهذا الملف نهائيًا. أكّد العملية للمتابعة.");
                var newPkItem = request.Columns.FirstOrDefault(i => i.Id == newPk.Id);
                if (newPkItem is null || !string.IsNullOrWhiteSpace(newPkItem.StandardField) || newPkItem.CategoryId is not null)
                    throw new InvalidDataException("عمود مفتاح الربط الجديد يجب أن يكون بدون حقل قياسي أو فئة.");
            }
        }
        var effectivePkId = pkChanged ? newPk!.Id : (request.PkColumnId ?? currentPk?.Id);

        var patches = new List<(FileColumn Column, StandardField? Field, Guid? CategoryId)>();
        var seen = new HashSet<StandardField>();
        var seenColumnIds = new HashSet<Guid>();
        foreach (var item in request.Columns)
        {
            if (!byId.TryGetValue(item.Id, out var column))
                throw new InvalidDataException("أحد الأعمدة لا ينتمي لهذا الملف.");
            if (!seenColumnIds.Add(item.Id))
                throw new InvalidDataException("لا يمكن إرسال العمود نفسه أكثر من مرة عند تعديل الربط.");
            if (effectivePkId.HasValue && column.Id == effectivePkId.Value
                && (!string.IsNullOrWhiteSpace(item.StandardField) || item.CategoryId is not null))
                throw new InvalidDataException("لا يمكن تعديل مفتاح الربط الرئيسي pk أو تصنيفه.");
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

        var oldMapping = file.Columns.Select(c => new
        {
            c.HeaderRaw,
            standardField = c.StandardField?.ToString(),
            c.CategoryId,
            c.SortOrder,
        }).ToList();
        var total = 0;
        await uow.ExecuteInTransactionAsync(async () =>
        {
        // A pk change invalidates every stored row identity (Record.Pk, edits
        // keyed by pk, quality): destroy all file rows first, then swap the
        // pk header onto the newly designated column. The header NAME set is
        // preserved (swap), only which physical column is the key moves.
        var recordsDeleted = 0;
        string? oldPkHeader = null;
        string? newPkHeader = null;
        if (pkChanged)
        {
            const int DeletePage = 500;
            while (true)
            {
                var doomed = await uow.Records.ListBatchesByFileAsync(fileId, null, DeletePage, ct);
                if (doomed.Count == 0) break;
                recordsDeleted += doomed.Count;
                uow.Records.RemoveRange(doomed);
                await uow.SaveChangesAsync(ct);
            }
            var allIssues = await uow.DataQuality.ListByFileAsync(fileId, ct);
            if (allIssues.Count > 0)
            {
                uow.DataQuality.RemoveRange(allIssues);
                await uow.SaveChangesAsync(ct);
            }
            var allEdits = await uow.RecordEdits.ListByFileAsync(fileId, ct);
            if (allEdits.Count > 0)
            {
                uow.RecordEdits.RemoveRange(allEdits);
                await uow.SaveChangesAsync(ct);
            }
            oldPkHeader = currentPk?.HeaderRaw;
            newPkHeader = newPk!.HeaderRaw;
            if (currentPk is not null)
            {
                (currentPk.HeaderRaw, newPk.HeaderRaw) = (newPk.HeaderRaw, currentPk.HeaderRaw);
                (currentPk.HeaderNormalized, newPk.HeaderNormalized) = (newPk.HeaderNormalized, currentPk.HeaderNormalized);
            }
            else
            {
                // Legacy file without a key: the designated column takes the pk name.
                newPk.HeaderRaw = "pk";
                newPk.HeaderNormalized = "pk";
            }
        }
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

        if (pkChanged)
        {
            // The file is now structurally re-keyed with zero rows: reset the
            // counters and refresh the header signature for the new layout.
            file.RowCount = 0;
            file.NextPk = 1;
            file.ColumnSignature = ComputeColumnSignature(file.Columns);
            file.UpdatedAt = DateTime.UtcNow;
            await uow.SaveChangesAsync(ct);
            await activity.WriteAsync(ActivityAction.FileUpdated, file.Name,
                new
                {
                    fileId, mappingUpdated = true, columns = patches.Count,
                    pkChanged = true, recordsDeleted, recordsUpdated = 0,
                    oldPkHeader, newPkHeader, by = actorUsername,
                    after = file.Columns.Select(c => new
                    {
                        c.HeaderRaw,
                        standardField = c.StandardField?.ToString(),
                        c.CategoryId,
                        c.SortOrder,
                    }).ToList(),
                }, ct);
            return;
        }

        // Rebuild shadows + non-empty quality issues for every record (500/page).
        var stale = await uow.DataQuality.ListNonEmptyByFileAsync(fileId, ct);
        uow.DataQuality.RemoveRange(stale);
        await uow.SaveChangesAsync(ct);
        const int Page = 500;
        var seenNational = new HashSet<string>(StringComparer.Ordinal);
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
        file.UpdatedAt = DateTime.UtcNow;
        await uow.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.FileUpdated, file.Name,
            new
            {
                fileId, mappingUpdated = true, columns = patches.Count,
                recordsUpdated = total, by = actorUsername,
                before = oldMapping,
                after = file.Columns.Select(c => new
                {
                    c.HeaderRaw,
                    standardField = c.StandardField?.ToString(),
                    c.CategoryId,
                    c.SortOrder,
                }).ToList(),
            }, ct);
        }, ct);
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
        // A version export marks only changes belonging to that version.
        // The full cross-version history remains available in the edits API.
        var edits = (await uow.RecordEdits.ListByFileAsync(fileId, ct))
            .Where(e => e.FileVersion == file.Version).ToList();
        var nationalHeader = file.Columns
            .FirstOrDefault(c => c.StandardField == StandardField.NationalId)?.HeaderRaw;
        return new FileExportDataDto(
            file.SheetName,
            file.Name,
            new[] { "pk" }.Concat(file.Columns.Where(c => !string.Equals(c.HeaderRaw, "pk", StringComparison.OrdinalIgnoreCase))
                .OrderBy(c => c.ColumnIndex).Select(c => c.HeaderRaw)).ToList(),
            records.Select(r => new ExportRecordDto(
                r.Id, r.RowIndex,
                ExportData(r),
                ToHeaderMap(r.FmtFills), ToHeaderMap(r.FmtFontColors),
                r.SfFullName, r.DNationalId ?? r.SfNationalId?.ToString())).ToList(),
            edits.Select(e => new ExportEditDto(
                e.RecordId?.ToString(), e.HeaderRaw, e.OldValue, e.NewValue,
                e.EditedBy, e.CreatedAt, e.Pk)).ToList(),
            nationalHeader);
    }

    private static Dictionary<string, string> ExportData(Record r)
    {
        var data = r.Data is null || r.Data.RootElement.ValueKind != JsonValueKind.Object
            ? new Dictionary<string, string>()
            : r.Data.RootElement.EnumerateObject().ToDictionary(
                p => p.Name,
                p => p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() ?? ""
                    : p.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ? "" : p.Value.GetRawText());
        // Export-facing pk: zero-padded text (00001) so Excel keeps it as
        // text with leading zeros. Import normalizes back to plain digits,
        // so round-trips stay clean; internal matching (preview/keep-old)
        // intentionally keeps plain digits.
        data["pk"] = (r.Pk ?? r.RowIndex).ToString(System.Globalization.CultureInfo.InvariantCulture).PadLeft(5, '0');
        return data;
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
        if ((target.Columns.Any(c => string.Equals(c.HeaderRaw, "pk", StringComparison.OrdinalIgnoreCase))
                && mapped.Count(c => string.Equals(c.HeaderRaw, "pk", StringComparison.OrdinalIgnoreCase)) != 1)
            || mapped.Any(c => string.Equals(c.HeaderRaw, "pk", StringComparison.OrdinalIgnoreCase)
                && (!string.IsNullOrWhiteSpace(c.StandardField) || c.CategoryId is not null)))
            throw new InvalidDataException("تحديث الملف يتطلب عمود pk الأصلي دون ربط أو فئة.");
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
            var state = await GetExportDataAsync(fileId, ct)
                ?? throw new InvalidDataException("تعذر حفظ نسخة الإصدار الحالية.");
            var snapshot = VersionSnapshotCodec.Encode(state);
            var currentEntry = (await uow.FileVersions.ListAsync(
                v => v.FileId == fileId && v.Version == previous, ct)).FirstOrDefault();
            if (currentEntry is null)
                uow.FileVersions.Add(new FileVersion
                {
                    FileId = fileId, Version = previous, Kind = "seed",
                    Note = "الإصدار السابق قبل رفع النسخة اليدوية.",
                    SnapshotGzip = snapshot,
                });
            else
                currentEntry.SnapshotGzip = snapshot;
            await uow.SaveChangesAsync(ct);
            // Archive live MANUAL edits of the current version: they stay
            // visible in history stamped with it, while the new version
            // starts clean. Bulk-audit rows of the current version belong to
            // it and are archived along (they are history, not pending).
            var live = await uow.RecordEdits.ListAsync(e => e.FileId == fileId && e.RecordId != null, ct);
            foreach (var edit in live)
            {
                if (edit.Pk is null && edit.RecordId.HasValue)
                {
                    var owner = await uow.Records.FindAsync(edit.RecordId.Value, ct);
                    edit.Pk = owner?.Pk;
                }
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
                SnapshotGzip = snapshot,
            });
            await uow.SaveChangesAsync(ct);
        }, ct);
        await activity.WriteAsync(ActivityAction.FileVersionBumped, file.Name,
            new { fileId, previousVersion = previous, newVersion = file.Version, archivedEdits = archived, note = trimmed, by = actorUsername }, ct);
        return new BumpVersionResponse(fileId, previous, file.Version, archived);
    }

    /// <summary>Exports an exact stored version state. Older installations
    /// have no snapshot, so refuse an inaccurate reconstructed workbook.</summary>
    public async Task<FileExportDataDto?> GetVersionExportDataAsync(Guid fileId, int version, CancellationToken ct = default)
    {
        var file = await uow.Files.FindWithColumnsAsync(fileId, ct);
        if (file is null) return null;
        if (version < 1 || version > file.Version)
            throw new InvalidDataException($"رقم الإصدار غير صالح. الإصدارات المتاحة من 1 إلى {file.Version}.");
        if (version == file.Version)
            return await GetExportDataAsync(fileId, ct);
        var entry = (await uow.FileVersions.ListByFileAsync(fileId, ct))
            .FirstOrDefault(v => v.Version == version);
        if (entry?.SnapshotGzip is null)
            throw new InvalidDataException("لا توجد نسخة محفوظة دقيقة لهذا الإصدار القديم؛ لا يمكن تصديره دون خطر عرض بيانات غير صحيحة.");
        var snapshot = VersionSnapshotCodec.Decode(entry.SnapshotGzip);
        // Early snapshots included the entire audit log. Keep the saved row
        // links (needed to highlight historical cells), but include only the
        // entries actually stamped with this version in its marked export.
        var versionEdits = await uow.RecordEdits.ListAsync(
            e => e.FileId == fileId && e.FileVersion == version, ct);
        var remaining = versionEdits
            .GroupBy(e => (e.HeaderRaw, e.OldValue, e.NewValue, e.CreatedAt))
            .ToDictionary(g => g.Key, g => g.Count());
        var filtered = new List<ExportEditDto>();
        foreach (var edit in snapshot.Edits)
        {
            var key = (edit.HeaderRaw, edit.OldValue, edit.NewValue, edit.CreatedAt);
            if (!remaining.TryGetValue(key, out var count) || count == 0) continue;
            filtered.Add(edit);
            remaining[key] = count - 1;
        }
        return snapshot with { Edits = filtered };
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
                v.CreatedBy, v.CreatedAt, counts.TryGetValue(v.Version, out var c) ? c : 0,
                v.Version == file.Version || v.SnapshotGzip is not null))
            .ToList();
        return new FileVersionsResponse(fileId, file.Version, pending, versions);
    }
}
