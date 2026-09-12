using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.GroupDto;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;

namespace ExcelArchive.Application.Services;

/// <summary>Group management + scoped reads. Mirrors V1 lib/actions/groups.ts
/// validation/messages and the groups + group-detail page queries.</summary>
public class GroupService(IUnitOfWork uow, IActivityService activity, IAuthService auth) : IGroupService
{
    public async Task<IReadOnlyList<GroupDto>> ListAsync(DataScopeDto scope, CancellationToken ct = default)
    {
        var groups = await uow.Groups.ListScopedAsync(scope.GroupIds, ct);
        var counts = await uow.Files.CountByGroupAsync(scope.FileIds, ct);
        return groups.Select(x =>
        {
            counts.TryGetValue(x.Id, out var c);
            return new GroupDto(x.Id, x.Name, x.Description, x.SortOrder,
                x.CreatedAt, x.UpdatedAt, c.Files, c.Records);
        }).ToList();
    }

    public async Task<GroupDto?> GetAsync(Guid id, DataScopeDto scope, CancellationToken ct = default)
    {
        var row = await uow.Groups.FindScopedAsync(id, scope.GroupIds, ct);
        if (row is null) return null;
        var counts = await uow.Files.CountByGroupAsync(scope.FileIds, ct);
        counts.TryGetValue(row.Id, out var c);
        return new GroupDto(row.Id, row.Name, row.Description, row.SortOrder,
            row.CreatedAt, row.UpdatedAt, c.Files, c.Records);
    }

    public async Task<GroupDetailDto?> GetDetailAsync(
        Guid id, CurrentUserDto user, CancellationToken ct = default)
    {
        var scope = await auth.ResolveDataScope(user, ct);
        var group = await GetAsync(id, scope, ct);
        if (group is null) return null;
        var files = await uow.Files.ListByGroupAsync(id, scope.FileIds, ct);
        var edited = new HashSet<Guid>();
        if (files.Count > 0 && auth.HasPermission(user, Permissions.EditsBadge))
        {
            var ids = files.Select(f => f.Id).ToList();
            edited = (await uow.RecordEdits.EditedFileIdsAsync(ids, ct)).ToHashSet();
        }
        return new GroupDetailDto(group, files.Select(f => new GroupFileDto(
            f.Id, f.GroupId, f.Name, f.Description, f.OriginalFilename,
            f.RowCount, f.Columns.Count, f.Version, f.UploadedAt, group.Name,
            edited.Contains(f.Id))).ToList());
    }

    public async Task<GroupDto> CreateAsync(CreateGroupRequest request, string actorUsername, CancellationToken ct = default)
    {
        var (name, description) = Validate(request.Name, request.Description);
        if (await uow.Groups.NameExistsAsync(name, ct: ct))
            throw new InvalidOperationException("يوجد اسم مجموعة مطابق بالفعل.");
        var last = await uow.Groups.MaxSortOrderAsync(ct) ?? -1;
        var group = new Group { Name = name, Description = description, SortOrder = last + 1 };
        await uow.ExecuteInTransactionAsync(async () =>
        {
            uow.Groups.Add(group);
            await uow.Groups.SaveAsync(ct);
            await activity.WriteAsync(ActivityAction.GroupCreated, group.Name,
                new { by = actorUsername }, ct);
        }, ct);
        return ToDto(group, 0, 0);
    }

    public async Task<GroupDto> UpdateAsync(Guid id, UpdateGroupRequest request, string actorUsername, CancellationToken ct = default)
    {
        var (name, description) = Validate(request.Name, request.Description);
        var group = await uow.Groups.FindWithFilesAsync(id, ct)
            ?? throw new KeyNotFoundException("المجموعة غير موجودة.");
        if (await uow.Groups.NameExistsAsync(name, id, ct))
            throw new InvalidOperationException("يوجد اسم مجموعة مطابق بالفعل.");
        await uow.ExecuteInTransactionAsync(async () =>
        {
            group.Name = name;
            group.Description = description;
            group.UpdatedAt = DateTime.UtcNow;
            await uow.Groups.SaveAsync(ct);
            await activity.WriteAsync(ActivityAction.GroupUpdated, group.Name,
                new { by = actorUsername }, ct);
        }, ct);
        return ToDto(group, group.Files.Count, group.Files.Sum(f => f.RowCount));
    }

    public async Task ReorderAsync(Guid id, string direction, string actorUsername, CancellationToken ct = default)
    {
        var groups = (await uow.Groups.ListOrderedAsync(ct)).ToList();
        var index = groups.FindIndex(x => x.Id == id);
        var swapIndex = direction == "up" ? index - 1 : index + 1;
        if (index < 0 || swapIndex < 0 || swapIndex >= groups.Count)
            throw new InvalidOperationException("لا يمكن نقل المجموعة في هذا الاتجاه.");

        var current = groups[index];
        var other = groups[swapIndex];
        await uow.ExecuteInTransactionAsync(async () =>
        {
            (current.SortOrder, other.SortOrder) = (other.SortOrder, current.SortOrder);
            await uow.SaveChangesAsync(ct);
            await activity.WriteAsync(ActivityAction.GroupReordered, current.Name,
                new { direction, by = actorUsername }, ct);
        }, ct);
    }

    public async Task DeleteAsync(Guid id, string confirmName, string actorUsername, CancellationToken ct = default)
    {
        var group = await uow.Groups.FindWithFilesAsync(id, ct)
            ?? throw new KeyNotFoundException("المجموعة غير موجودة.");
        if (confirmName != group.Name)
            throw new InvalidOperationException("اسم التأكيد لا يطابق اسم المجموعة.");
        var records = group.Files.Sum(f => f.RowCount);
        var fileCount = group.Files.Count;
        var name = group.Name;
        await uow.ExecuteInTransactionAsync(async () =>
        {
            uow.Groups.Remove(group);
            await uow.SaveChangesAsync(ct);
            await activity.WriteAsync(ActivityAction.GroupDeleted, name,
                new { files = fileCount, records, by = actorUsername }, ct);
        }, ct);
    }

    private static (string Name, string Description) Validate(string? name, string? description)
    {
        name = name?.Trim() ?? "";
        description = description?.Trim() ?? "";
        if (name.Length < 2) throw new InvalidDataException("اسم المجموعة قصير جدًا.");
        if (name.Length > 120) throw new InvalidDataException("اسم المجموعة طويل جدًا.");
        if (description.Length > 500) throw new InvalidDataException("الوصف طويل جدًا.");
        return (name, description);
    }

    private static GroupDto ToDto(Group x, int files, long records) =>
        new(x.Id, x.Name, x.Description, x.SortOrder, x.CreatedAt, x.UpdatedAt, files, records);
}
