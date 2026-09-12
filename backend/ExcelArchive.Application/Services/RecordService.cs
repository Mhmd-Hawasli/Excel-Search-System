using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.RecordDto;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Application.Services;

/// <summary>Complete record read model ported from V1 records/[id]/page.tsx:
/// category-ordered columns, badge-gated edit history, and the four scoped
/// related/conflict lookups (record-scoped; the 58-rule engine is Phase 4).</summary>
public class RecordService(IUnitOfWork uow, IAuthService auth) : IRecordService
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
}
