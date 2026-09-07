using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Groups;
using ExcelArchive.Api.Models.Entities;
using ExcelArchive.Api.Models.Enums;
using ExcelArchive.Api.Repositories;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Services;

public class GroupService(AppDbContext db, IActivityService activity, IGroupRepository repository) : IGroupService
{
    public async Task<IReadOnlyList<GroupDto>> ListAsync(CancellationToken ct = default)
    {
        var rows = await db.Groups.AsNoTracking()
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.CreatedAt)
            .ToListAsync(ct);
        return rows.Select(ToDto).ToList();
    }

    public async Task<GroupDto?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var row = await db.Groups.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        return row is null ? null : ToDto(row);
    }

    public async Task<GroupDto> CreateAsync(CreateGroupRequest request, string actorUsername, CancellationToken ct = default)
    {
        var last = await db.Groups.MaxAsync(x => (int?)x.SortOrder, ct) ?? -1;
        var group = new Group
        {
            Name = request.Name.Trim(),
            Description = request.Description?.Trim() ?? "",
            SortOrder = last + 1,
        };
        db.Groups.Add(group);
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.GroupCreated, group.Name, new { by = actorUsername }, ct);
        return ToDto(group);
    }

    public async Task<GroupDto> UpdateAsync(Guid id, UpdateGroupRequest request, string actorUsername, CancellationToken ct = default)
    {
        var group = await db.Groups.FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new KeyNotFoundException("غير موجود.");
        group.Name = request.Name.Trim();
        group.Description = request.Description?.Trim() ?? "";
        group.UpdatedAt = DateTime.UtcNow;
        db.Groups.Update(group);
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.GroupUpdated, group.Name, new { by = actorUsername }, ct);
        return ToDto(group);
    }

    public async Task ReorderAsync(Guid id, string direction, string actorUsername, CancellationToken ct = default)
    {
        var groups = await db.Groups.OrderBy(x => x.SortOrder).ThenBy(x => x.CreatedAt).ToListAsync(ct);
        var index = groups.FindIndex(x => x.Id == id);
        var swapIndex = direction == "up" ? index - 1 : index + 1;
        if (index < 0 || swapIndex < 0 || swapIndex >= groups.Count) throw new InvalidOperationException("لا يمكن نقل المجموعة في هذا الاتجاه.");

        var current = groups[index];
        var other = groups[swapIndex];
        (current.SortOrder, other.SortOrder) = (other.SortOrder, current.SortOrder);
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.GroupReordered, current.Name, new { direction, by = actorUsername }, ct);
    }

    public async Task DeleteAsync(Guid id, string confirmName, string actorUsername, CancellationToken ct = default)
    {
        var group = await db.Groups.Include(g => g.Files).FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new KeyNotFoundException("غير موجود.");
        if (confirmName != group.Name) throw new InvalidOperationException("اسم التأكيد لا يطابق اسم المجموعة.");
        var records = group.Files.Sum(f => f.RowCount);
        var fileCount = group.Files.Count;
        db.Groups.Remove(group);
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.GroupDeleted, group.Name,
            new { files = fileCount, records, by = actorUsername }, ct);
    }

    private static GroupDto ToDto(Group x) =>
        new(x.Id, x.Name, x.Description, x.SortOrder, x.CreatedAt, x.UpdatedAt);
}
