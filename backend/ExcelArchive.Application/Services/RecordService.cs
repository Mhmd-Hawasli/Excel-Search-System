using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.RecordDto;
using ExcelArchive.Application.Common;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Records;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Application.Services;

/// <summary>Complete record read model ported from V1 records/[id]/page.tsx:
/// category-ordered columns, badge-gated edit history, and the four scoped
/// related/conflict lookups (record-scoped; the 58-rule engine is Phase 4).</summary>
public class RecordService(IUnitOfWork uow, IAuthService auth, IActivityService activity) : IRecordService
{
    private const int RelatedLimit = 50;

    public async Task<RecordDetailDto?> GetDetailAsync(Guid recordId, CurrentUserDto user, CancellationToken ct = default)
    {
        var record = await uow.Records.FindDetailAsync(recordId, ct);
        if (record is null) return null;
        var scope = await auth.ResolveDataScope(user, ct);
        if (scope.FileIds is not null && !scope.FileIds.Contains(record.FileId)) return null;

        var canViewHistory = auth.HasPermission(user, Permissions.EditsView);
        var showBadges = auth.HasPermission(user, Permissions.EditsBadge);
        IReadOnlyDictionary<string, EditedHeaderDto> editedHeaders = new Dictionary<string, EditedHeaderDto>();
        var editCount = 0;
        if (canViewHistory)
        {
            var (headers, count) = await RecordEditsAsync(recordId, ct);
            editCount = count;
            editedHeaders = showBadges ? headers : new Dictionary<string, EditedHeaderDto>();
        }
        else if (showBadges)
        {
            editCount = await uow.RecordEdits.CountByRecordAsync(recordId, ct);
        }

        var data = record.Data is null || record.Data.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object
            ? new Dictionary<string, string>()
            : record.Data.RootElement.EnumerateObject().ToDictionary(
                p => p.Name,
                p => p.Value.ValueKind == System.Text.Json.JsonValueKind.String ? p.Value.GetString() ?? ""
                    : p.Value.ValueKind is System.Text.Json.JsonValueKind.Null or System.Text.Json.JsonValueKind.Undefined ? "" : p.Value.GetRawText());
        var columns = record.File.Columns.Select(c => new RecordDetailColumnDto(
            c.Id, c.HeaderRaw, c.CategoryId, c.Category?.Name, c.Category?.SortOrder,
            c.StandardField.HasValue ? StandardFieldKeys.Key(c.StandardField.Value) : null,
            data.TryGetValue(c.HeaderRaw, out var v) ? v : "")).ToList();

        var displayName = record.SfFullName
            ?? string.Join(" ", new[] { record.SfFirstName, record.SfFatherName, record.SfLastName }
                .Where(p => !string.IsNullOrWhiteSpace(p)));
        if (string.IsNullOrWhiteSpace(displayName)) displayName = "سجل بلا اسم";

        var fileIds = scope.FileIds;
        return new RecordDetailDto(
            record.Id, record.FileId, record.File.Name, record.File.GroupId, record.File.Group.Name,
            record.File.Description, record.File.OriginalFilename, record.File.UploadedAt,
            record.RowIndex, displayName, record.SfNationalId?.ToString(), record.DNationalId, record.NationalIdNum,
            columns, editedHeaders, editCount,
            await RelatedByNationalIdAsync(record, fileIds, ct),
            await RelatedByPersonAsync(record, fileIds, ct),
            await ConflictByNationalIdAsync(record, fileIds, ct),
            await ConflictByMotherAsync(record, fileIds, ct));
    }

    private async Task<(Dictionary<string, EditedHeaderDto> Headers, int Count)> RecordEditsAsync(
        Guid recordId, CancellationToken ct)
    {
        var edits = await uow.RecordEdits.ListByRecordAsync(recordId, ct);
        var headers = new Dictionary<string, EditedHeaderDto>(StringComparer.Ordinal);
        // Oldest-first pass: first oldValue is the true Excel original, last write wins.
        foreach (var edit in edits.OrderBy(e => e.CreatedAt))
        {
            if (!headers.TryGetValue(edit.HeaderRaw, out var existing))
                headers[edit.HeaderRaw] = new EditedHeaderDto(1, edit.OldValue, edit.NewValue, edit.CreatedAt);
            else
                headers[edit.HeaderRaw] = existing with
                {
                    Count = existing.Count + 1, LastValue = edit.NewValue, LastAt = edit.CreatedAt,
                };
        }
        return (headers, edits.Count);
    }

    private async Task<RelatedGroupDto> RelatedByNationalIdAsync(Record record, IReadOnlyList<Guid>? fileIds, CancellationToken ct)
    {
        if (record.NationalIdNum is null) return new RelatedGroupDto([], false);
        return CappedAsync(await uow.Records.RelatedByNationalIdAsync(
            record.NationalIdNum.Value, record.Id, fileIds, RelatedLimit + 1, ct));
    }

    private async Task<RelatedGroupDto> RelatedByPersonAsync(Record record, IReadOnlyList<Guid>? fileIds, CancellationToken ct)
    {
        if (record.NFullName is null || record.NMotherName is null)
            return new RelatedGroupDto([], false);
        return CappedAsync(await uow.Records.RelatedByPersonAsync(
            record.NFullName, record.NMotherName, record.Id, fileIds, RelatedLimit + 1, ct));
    }

    private async Task<RelatedGroupDto> ConflictByNationalIdAsync(Record record, IReadOnlyList<Guid>? fileIds, CancellationToken ct)
    {
        if (record.NFullName is null) return new RelatedGroupDto([], false);
        return CappedAsync(await uow.Records.ConflictByNationalIdAsync(
            record.NFullName, record.NationalIdNum, record.Id, fileIds, RelatedLimit + 1, ct));
    }

    private async Task<RelatedGroupDto> ConflictByMotherAsync(Record record, IReadOnlyList<Guid>? fileIds, CancellationToken ct)
    {
        if (record.NFullName is null) return new RelatedGroupDto([], false);
        return CappedAsync(await uow.Records.ConflictByMotherAsync(
            record.NFullName, record.NMotherName, record.Id, fileIds, RelatedLimit + 1, ct));
    }

    private static RelatedGroupDto CappedAsync(IReadOnlyList<Record> rows)
    {
        var mapped = rows.Select(r => new RelatedRecordDto(
                r.Id, r.SfFullName, r.SfFirstName, r.SfFatherName, r.SfLastName, r.SfMotherName,
                r.DNationalId, r.File.Name, r.File.Group.Name, r.File.UploadedAt)).ToList();
        return mapped.Count > RelatedLimit
            ? new RelatedGroupDto(mapped.Take(RelatedLimit).ToList(), true)
            : new RelatedGroupDto(mapped, false);
    }

    public async Task<Guid?> GetFileIdAsync(Guid recordId, CancellationToken ct = default)
    {
        var record = await uow.Records.FindAsync(recordId, ct);
        return record?.FileId;
    }

    public async Task<ManualRecordTemplateDto?> GetTemplateAsync(Guid fileId, CurrentUserDto user, CancellationToken ct = default)
    {
        var file = await uow.Files.FindWithColumnsAsync(fileId, ct);
        if (file is null) return null;
        var scope = await auth.ResolveDataScope(user, ct);
        if (scope.FileIds is not null && !scope.FileIds.Contains(fileId)) return null;

        var columns = file.Columns
            .OrderBy(c => c.Category?.SortOrder ?? int.MaxValue)
            .ThenBy(c => c.SortOrder)
            .ThenBy(c => c.ColumnIndex)
            .Select(c => new ManualRecordTemplateColumnDto(
                c.Id, c.HeaderRaw,
                c.StandardField.HasValue ? StandardFieldKeys.Key(c.StandardField.Value) : null,
                c.CategoryId, c.Category?.Name, c.Category?.SortOrder, c.ColumnIndex))
            .ToList();
        return new ManualRecordTemplateDto(file.Id, file.Name, file.GroupId, file.Group.Name, columns);
    }

    public async Task<SuggestionListDto?> GetSuggestionsAsync(Guid fileId, string? standardField, Guid? columnId, int take, CurrentUserDto user, CancellationToken ct = default)
    {
        var file = await uow.Files.FindWithColumnsAsync(fileId, ct);
        if (file is null) return null;
        var scope = await auth.ResolveDataScope(user, ct);
        if (scope.FileIds is not null && !scope.FileIds.Contains(fileId)) return null;

        Domain.Entities.FileColumn? target = null;
        if (columnId.HasValue)
            target = file.Columns.FirstOrDefault(c => c.Id == columnId.Value);
        else if (!string.IsNullOrWhiteSpace(standardField))
        {
            var parsed = StandardFieldKeys.Parse(standardField);
            if (parsed.HasValue)
                target = file.Columns.FirstOrDefault(c => c.StandardField == parsed.Value);
        }
        if (target is null) return null;

        var values = (await uow.Records.ListDistinctValuesAsync(fileId, target.HeaderRaw, Math.Clamp(take, 1, 200), ct)).ToList();

        // الفئة الوظيفية: اعرض الفئات المعروفة داخل النظام دائماً (قابلة للإدخال اليدوي أيضاً).
        if (target.StandardField == StandardField.FunctionalCategory)
        {
            foreach (var label in FunctionalCategory.Labels)
                if (!values.Contains(label, StringComparer.Ordinal))
                    values.Add(label);
        }

        return new SuggestionListDto(
            fileId,
            target.StandardField.HasValue ? StandardFieldKeys.Key(target.StandardField.Value) : null,
            target.Id, target.HeaderRaw, values);
    }

    public async Task ValidateManualAsync(Guid fileId, CreateManualRecordRequest request, CurrentUserDto user, CancellationToken ct = default)
    {
        // تدقيق خطوة بخطوة لزر "التالي": نفس فحص التكرار في الإنشاء بدون أي كتابة.
        var file = await uow.Files.FindWithColumnsAsync(fileId, ct)
            ?? throw new KeyNotFoundException("الملف غير موجود.");
        var scope = await auth.ResolveDataScope(user, ct);
        if (scope.FileIds is not null && !scope.FileIds.Contains(fileId))
            throw new KeyNotFoundException("الملف غير موجود.");

        var columns = file.Columns
            .OrderBy(c => c.ColumnIndex)
            .ToList();
        if (columns.Count == 0)
            throw new InvalidDataException("هذا الملف لا يحتوي على أعمدة.");

        var (data, byField) = ParseManualValues(columns, request?.Values);
        await EnsureUniqueInFileAsync(fileId, columns, data, byField, ct);
    }

    public async Task<ManualRecordCreatedDto> CreateManualAsync(Guid fileId, CreateManualRecordRequest request, CurrentUserDto user, CancellationToken ct = default)
    {
        var file = await uow.Files.FindWithColumnsAsync(fileId, ct)
            ?? throw new KeyNotFoundException("الملف غير موجود.");
        var scope = await auth.ResolveDataScope(user, ct);
        if (scope.FileIds is not null && !scope.FileIds.Contains(fileId))
            throw new KeyNotFoundException("الملف غير موجود.");

        var columns = file.Columns
            .OrderBy(c => c.ColumnIndex)
            .ToList();
        if (columns.Count == 0)
            throw new InvalidDataException("هذا الملف لا يحتوي على أعمدة.");

        var (data, byField) = ParseManualValues(columns, request?.Values);

        if (data.Values.All(string.IsNullOrWhiteSpace))
            throw new InvalidDataException("أدخل قيمة واحدة على الأقل.");

        // منع التكرار داخل الملف الواحد فقط.
        await EnsureUniqueInFileAsync(fileId, columns, data, byField, ct);

        var rowIndex = await uow.Records.GetMaxRowIndexAsync(fileId, ct) + 1;

        var record = new Record
        {
            FileId = fileId,
            RowIndex = rowIndex,
            Data = System.Text.Json.JsonSerializer.SerializeToDocument(data),
        };
        RecordShadowMapper.Apply(record, byField);

        Record? created = null;
        await uow.ExecuteInTransactionAsync(async () =>
        {
            uow.Records.Add(record);
            await uow.SaveChangesAsync(ct);

            var trackedFile = await uow.Files.FindAsync(fileId, ct);
            if (trackedFile is not null)
            {
                trackedFile.RowCount += 1;
                trackedFile.UpdatedAt = DateTime.UtcNow;
            }
            await uow.SaveChangesAsync(ct);

            // قضايا الجودة للصف الجديد (بدون كشف التكرار العام — تم منعه مسبقاً داخل الملف).
            var fields = columns
                .Where(c => c.StandardField.HasValue)
                .ToDictionary(
                    c => c.StandardField!.Value,
                    c => (c.HeaderRaw, Value: data.TryGetValue(c.HeaderRaw, out var v) ? v ?? "" : ""));
            var issues = RecordQualityChecker.CheckRow(fileId, rowIndex, fields, rowHasValue: true);
            if (issues.Count > 0)
            {
                uow.DataQuality.AddRange(issues);
                await uow.SaveChangesAsync(ct);
            }

            created = record;
        }, ct);

        return new ManualRecordCreatedDto(created!.Id, fileId, rowIndex);
    }

    public async Task<RecordDeletedDto?> DeleteAsync(Guid recordId, CurrentUserDto user, CancellationToken ct = default)
    {
        var record = await uow.Records.FindWithFileAsync(recordId, ct);
        if (record is null) return null;
        var scope = await auth.ResolveDataScope(user, ct);
        if (scope.FileIds is not null && !scope.FileIds.Contains(record.FileId)) return null;

        var fileId = record.FileId;
        var rowIndex = record.RowIndex;
        var displayName = record.SfFullName
            ?? string.Join(" ", new[] { record.SfFirstName, record.SfFatherName, record.SfLastName }
                .Where(p => !string.IsNullOrWhiteSpace(p)));
        if (string.IsNullOrWhiteSpace(displayName)) displayName = "سجل بلا اسم";
        var fileName = record.File.Name;

        await uow.ExecuteInTransactionAsync(async () =>
        {
            // قضايا الجودة مرتبطة بالصف (ملف + رقم صف) لا بالسجل: تُحذف معه.
            // تعديلات السجل وتجاهلات التضارب تُحذف تتابعياً عبر العلاقات.
            var issues = await uow.DataQuality.ListAsync(i => i.FileId == fileId && i.RowIndex == rowIndex, ct);
            uow.DataQuality.RemoveRange(issues);
            uow.Records.Remove(record);
            await uow.SaveChangesAsync(ct);

            var file = await uow.Files.FindAsync(fileId, ct);
            if (file is not null)
            {
                file.RowCount = Math.Max(0, file.RowCount - 1);
                file.UpdatedAt = DateTime.UtcNow;
            }
            await uow.SaveChangesAsync(ct);
            await activity.WriteAsync(ActivityAction.RecordDeleted, displayName,
                new { recordId, fileId, fileName, rowIndex, by = user.Username }, ct);
        }, ct);

        return new RecordDeletedDto(fileId, rowIndex);
    }

    private static (Dictionary<string, string> Data, Dictionary<StandardField, string?> ByField) ParseManualValues(
        IReadOnlyList<Domain.Entities.FileColumn> columns, Dictionary<string, string>? raw)
    {
        var byColumnId = new Dictionary<Guid, string>();
        var byHeader = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var kv in raw ?? new Dictionary<string, string>())
        {
            var v = kv.Value ?? "";
            if (v.Length > 5000) throw new InvalidDataException("إحدى القيم طويلة جدًا.");
            if (Guid.TryParse(kv.Key, out var colId))
                byColumnId[colId] = v;
            else
                byHeader[kv.Key] = v;
        }

        var data = new Dictionary<string, string>(StringComparer.Ordinal);
        var byField = new Dictionary<StandardField, string?>();
        foreach (var column in columns)
        {
            string value = "";
            if (byColumnId.TryGetValue(column.Id, out var v1)) value = v1 ?? "";
            else if (byHeader.TryGetValue(column.HeaderRaw, out var v2)) value = v2 ?? "";
            value = value.Trim();
            data[column.HeaderRaw] = value;
            if (column.StandardField.HasValue)
                byField[column.StandardField.Value] = value;
        }
        return (data, byField);
    }

    private async Task EnsureUniqueInFileAsync(
        Guid fileId,
        IReadOnlyList<Domain.Entities.FileColumn> columns,
        IReadOnlyDictionary<string, string> data,
        IReadOnlyDictionary<StandardField, string?> byField,
        CancellationToken ct)
    {
        string FieldValue(StandardField f)
            => byField.TryGetValue(f, out var v) ? (v ?? "").Trim() : "";

        string HeaderOf(StandardField f)
            => columns.FirstOrDefault(c => c.StandardField == f)?.HeaderRaw ?? "";

        // الرقم الوطني
        var nationalRaw = FieldValue(StandardField.NationalId);
        if (!string.IsNullOrWhiteSpace(nationalRaw))
        {
            var dNational = ArabicNormalizer.NormalizeNationalId(nationalRaw);
            if (!string.IsNullOrEmpty(dNational))
            {
                if (await uow.Records.ExistsNationalAsync(fileId, dNational, ct))
                    throw new ConflictException("الرقم الوطني موجود مسبقًا داخل هذا الملف.");
            }
            else if (await uow.Records.ExistsRawAsync(fileId, HeaderOf(StandardField.NationalId), nationalRaw.Trim(), ct))
                throw new ConflictException("الرقم الوطني موجود مسبقًا داخل هذا الملف.");
        }

        // الشام كاش
        var shamRaw = FieldValue(StandardField.ShamCash);
        if (!string.IsNullOrWhiteSpace(shamRaw))
        {
            var shamVal = ShamCash.AsBigInt(shamRaw);
            if (shamVal.HasValue)
            {
                if (await uow.Records.ExistsShamAsync(fileId, shamVal.Value, ct))
                    throw new ConflictException("رقم الشام كاش موجود مسبقًا داخل هذا الملف.");
            }
            else
            {
                var digits = ArabicNormalizer.DigitsOnly(shamRaw);
                if (digits.Length > 0
                    && await uow.Records.ExistsRawAsync(fileId, HeaderOf(StandardField.ShamCash), shamRaw.Trim(), ct))
                    throw new ConflictException("رقم الشام كاش موجود مسبقًا داخل هذا الملف.");
            }
        }

        // الرقم الذاتي
        var personalRaw = FieldValue(StandardField.PersonalNo);
        if (!string.IsNullOrWhiteSpace(personalRaw))
        {
            var dPersonal = ArabicNormalizer.DigitsOnly(personalRaw);
            if (dPersonal.Length > 0)
            {
                if (await uow.Records.ExistsPersonalAsync(fileId, dPersonal, ct))
                    throw new ConflictException("الرقم الذاتي موجود مسبقًا داخل هذا الملف.");
            }
            else if (await uow.Records.ExistsRawAsync(fileId, HeaderOf(StandardField.PersonalNo), personalRaw.Trim(), ct))
                throw new ConflictException("الرقم الذاتي موجود مسبقًا داخل هذا الملف.");
        }

        // رقم الهاتف
        var phoneRaw = FieldValue(StandardField.Phone);
        if (!string.IsNullOrWhiteSpace(phoneRaw))
        {
            var dPhone = ArabicNormalizer.DigitsOnly(phoneRaw);
            if (dPhone.Length > 0)
            {
                if (await uow.Records.ExistsPhoneAsync(fileId, dPhone, ct))
                    throw new ConflictException("رقم الهاتف موجود مسبقًا داخل هذا الملف.");
            }
            else if (await uow.Records.ExistsRawAsync(fileId, HeaderOf(StandardField.Phone), phoneRaw.Trim(), ct))
                throw new ConflictException("رقم الهاتف موجود مسبقًا داخل هذا الملف.");
        }
    }
}
