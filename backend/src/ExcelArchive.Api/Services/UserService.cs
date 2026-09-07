using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Users;
using ExcelArchive.Api.Models.Entities;
using ExcelArchive.Api.Models.Enums;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Services;

public class UserService(AppDbContext db, IAuthService auth, IActivityService activity) : IUserService
{
    public async Task<IReadOnlyList<UserDto>> ListAsync(CancellationToken ct = default)
    {
        var users = await db.Users.AsNoTracking()
            .Include(u => u.Permissions)
            .OrderBy(u => u.CreatedAt)
            .ToListAsync(ct);
        return users.Select(ToDto).ToList();
    }

    public async Task<UserDto?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var user = await db.Users.AsNoTracking().Include(u => u.Permissions).FirstOrDefaultAsync(u => u.Id == id, ct);
        return user is null ? null : ToDto(user);
    }

    public async Task<UserDto> CreateAsync(CreateUserRequest request, string actorUsername, CancellationToken ct = default)
    {
        var assignments = NormalizeAssignments(request.Permissions);
        await ValidateTargetsAsync(assignments, ct);

        var user = new User
        {
            Username = request.Username.Trim(),
            PasswordHash = auth.HashPassword(request.Password),
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? null : request.DisplayName.Trim(),
            IsActive = request.IsActive,
        };
        user.Permissions = assignments.Select(a => new UserPermission
        {
            Permission = a.Permission,
            GroupId = a.GroupId,
            FileId = a.FileId,
        }).ToList();

        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.UserCreated, user.Username, new { by = actorUsername }, ct);

        var dto = await GetAsync(user.Id, ct);
        return dto ?? ToDtoWithPermissions(user);
    }

    public async Task<UserDto> UpdateAsync(Guid id, UpdateUserRequest request, string actorUsername, CancellationToken ct = default)
    {
        var user = await db.Users.Include(u => u.Permissions).FirstOrDefaultAsync(u => u.Id == id, ct)
            ?? throw new KeyNotFoundException("غير موجود.");
        user.DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? null : request.DisplayName.Trim();
        user.IsActive = request.IsActive;
        if (!string.IsNullOrWhiteSpace(request.Password)) user.PasswordHash = auth.HashPassword(request.Password);
        user.UpdatedAt = DateTime.UtcNow;
        db.Users.Update(user);
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.UserUpdated, user.Username, new { by = actorUsername }, ct);
        return ToDto(user);
    }

    public async Task DeleteAsync(Guid id, string actorUsername, CancellationToken ct = default)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct)
            ?? throw new KeyNotFoundException("غير موجود.");
        db.Users.Remove(user);
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.UserDeleted, user.Username, new { by = actorUsername }, ct);
    }

    public async Task<UserPermissionsDto> ReplacePermissionsAsync(Guid id, ReplacePermissionsRequest request, string actorUsername, CancellationToken ct = default)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct)
            ?? throw new KeyNotFoundException("غير موجود.");
        var assignments = NormalizeAssignments(request.Permissions);
        await ValidateTargetsAsync(assignments, ct);

        var existing = await db.UserPermissions.Where(p => p.UserId == id).ToListAsync(ct);
        db.UserPermissions.RemoveRange(existing);
        db.UserPermissions.AddRange(assignments.Select(a => new UserPermission
        {
            UserId = id,
            Permission = a.Permission,
            GroupId = a.GroupId,
            FileId = a.FileId,
        }));
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.UserPermissionsUpdated, user.Username,
            new { by = actorUsername, permissions = assignments.Select(a => a.Permission).ToList() }, ct);
        return new UserPermissionsDto(id, user.Username, assignments);
    }

    private async Task ValidateTargetsAsync(IReadOnlyList<PermissionAssignmentDto> rows, CancellationToken ct)
    {
        foreach (var row in rows)
        {
            if (row.GroupId is not null && !await db.Groups.AnyAsync(g => g.Id == row.GroupId.Value, ct))
                throw new InvalidOperationException("المجموعة المحددة غير موجودة.");
            if (row.FileId is not null && !await db.Files.AnyAsync(f => f.Id == row.FileId.Value, ct))
                throw new InvalidOperationException("الملف المحدد غير موجود.");
        }
    }

    private static IReadOnlyList<PermissionAssignmentDto> NormalizeAssignments(IEnumerable<PermissionAssignmentDto>? rows)
    {
        var result = new List<PermissionAssignmentDto>();
        var seen = new HashSet<string>();
        foreach (var row in rows ?? [])
        {
            var permission = row.Permission == "files.viewScoped" ? Permissions.GroupsViewScoped : row.Permission;
            if (permission == "search.view" || permission == "search.scoped") continue;
            var key = $"{permission}|{row.GroupId}|{row.FileId}";
            if (seen.Add(key)) result.Add(row with { Permission = permission });
        }
        return result;
    }

    private static UserDto ToDto(User u) =>
        new(u.Id, u.Username, u.DisplayName, u.IsActive, u.CreatedAt,
            u.Permissions.Select(p => new PermissionAssignmentDto(p.Permission, p.GroupId, p.FileId)).ToList());

    private static UserDto ToDtoWithPermissions(User u) =>
        new(u.Id, u.Username, u.DisplayName, u.IsActive, u.CreatedAt,
            u.Permissions.Select(p => new PermissionAssignmentDto(p.Permission, p.GroupId, p.FileId)).ToList());
}
