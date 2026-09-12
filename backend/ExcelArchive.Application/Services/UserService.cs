using ExcelArchive.Application.Common;
using ExcelArchive.Application.DTOs.UserDto;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Application.Interfaces.Services;

namespace ExcelArchive.Application.Services;

public class UserService(IUnitOfWork uow, IAuthService auth, IActivityService activity) : IUserService
{
    public async Task<IReadOnlyList<UserDto>> ListAsync(CancellationToken ct = default)
    {
        return (await uow.Users.ListWithPermissionsAsync(ct)).Select(ToDto).ToList();
    }

    public async Task<UserDto?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var user = await uow.Users.FindWithPermissionsAsync(id, ct);
        return user is null ? null : ToDto(user);
    }

    public async Task<UserDto> CreateAsync(CreateUserRequest request, string actorUsername, CancellationToken ct = default)
    {
        // V1 createUserSchema: username trimmed 3–64, password 6–200
        // untrimmed, display trimmed ≤120, active default true.
        var username = (request.Username ?? "").Trim();
        if (username.Length < 3) throw new InvalidDataException("اسم المستخدم قصير جدًا.");
        if (username.Length > 64) throw new InvalidDataException("اسم المستخدم طويل جدًا.");
        var password = request.Password ?? "";
        if (password.Length < 6) throw new InvalidDataException("كلمة المرور قصيرة جدًا.");
        if (password.Length > 200) throw new InvalidDataException("كلمة المرور طويلة جدًا.");
        var display = (request.DisplayName ?? "").Trim();
        if (display.Length > 120) throw new InvalidDataException("الاسم المعروض طويل جدًا.");
        if (await uow.Users.UsernameExistsAsync(username, ct))
            throw new ConflictException("يوجد مستخدم بهذا الاسم مسبقًا.");

        var assignments = await PrepareAssignmentsAsync(request.Permissions, ct);

        var user = new User
        {
            Username = username,
            PasswordHash = auth.HashPassword(password),
            DisplayName = display.Length == 0 ? null : display,
            IsActive = request.IsActive,
        };
        user.Permissions = assignments.Select(a => new UserPermission
        {
            Permission = a.Permission,
            GroupId = a.GroupId,
            FileId = a.FileId,
        }).ToList();

        await uow.Users.AddUserAsync(user, ct);
        await activity.WriteAsync(ActivityAction.UserCreated, user.Username, new { by = actorUsername }, ct);

        var dto = await GetAsync(user.Id, ct);
        return dto ?? ToDtoWithPermissions(user);
    }

    public async Task<UserDto> UpdateAsync(Guid id, UpdateUserRequest request, string actorUsername, CancellationToken ct = default)
    {
        var user = await uow.Users.FindWithPermissionsAsync(id, ct)
            ?? throw new KeyNotFoundException("غير موجود.");
        // V1 PATCH presence semantics: absent displayName/isActive leave the
        // row untouched; explicit null/blank display clears it.
        if (request.DisplayNameSet)
        {
            var display = (request.DisplayName ?? "").Trim();
            if (display.Length > 120) throw new InvalidDataException("الاسم المعروض طويل جدًا.");
            user.DisplayName = display.Length == 0 ? null : display;
        }
        if (request.IsActive.HasValue) user.IsActive = request.IsActive.Value;
        if (request.Password is not null)
        {
            if (request.Password.Length < 6) throw new InvalidDataException("كلمة المرور قصيرة جدًا.");
            if (request.Password.Length > 200) throw new InvalidDataException("كلمة المرور طويلة جدًا.");
            user.PasswordHash = auth.HashPassword(request.Password);
        }
        user.UpdatedAt = DateTime.UtcNow;
        uow.Users.Update(user);
        await uow.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.UserUpdated, user.Username, new { by = actorUsername }, ct);
        return ToDto(user);
    }

    public async Task DeleteAsync(Guid id, string actorUsername, CancellationToken ct = default)
    {
        var user = await uow.Users.FindAsync(id, ct)
            ?? throw new KeyNotFoundException("غير موجود.");
        uow.Users.Remove(user);
        await uow.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.UserDeleted, user.Username, new { by = actorUsername }, ct);
    }

    public async Task<UserPermissionsDto> ReplacePermissionsAsync(Guid id, ReplacePermissionsRequest request, string actorUsername, CancellationToken ct = default)
    {
        var user = await uow.Users.FindAsync(id, ct)
            ?? throw new KeyNotFoundException("غير موجود.");
        var assignments = await PrepareAssignmentsAsync(request.Permissions, ct);

        await uow.Users.ReplacePermissionsAsync(id, assignments.Select(a => new UserPermission
        {
            UserId = id,
            Permission = a.Permission,
            GroupId = a.GroupId,
            FileId = a.FileId,
        }).ToList(), ct);
        await uow.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.UserPermissionsUpdated, user.Username,
            new { by = actorUsername, permissions = assignments.Select(a => a.Permission).ToList() }, ct);
        return new UserPermissionsDto(id, user.Username, assignments);
    }

    /// <summary>Validates rows (V1 permissionAssignmentSchema), unifies legacy
    /// keys, checks referenced targets exist, then snapshots group/all
    /// selections into explicit current-file grants (V1 resolveFileAssignments).</summary>
    private async Task<IReadOnlyList<PermissionAssignmentDto>> PrepareAssignmentsAsync(
        IEnumerable<PermissionAssignmentDto>? rows, CancellationToken ct)
    {
        var list = (rows ?? []).ToList();
        foreach (var row in list) ValidateAssignment(row);
        var unified = NormalizeAssignments(list);
        await ValidateTargetsAsync(unified, ct);
        return await ResolveFileAssignmentsAsync(unified, ct);
    }

    private static void ValidateAssignment(PermissionAssignmentDto row)
    {
        var permission = row.Permission ?? "";
        var known = Permissions.Canonical.Contains(permission)
            || permission is "files.viewScoped" or "search.view" or "search.scoped";
        if (!known) throw new InvalidDataException("صلاحية غير معروفة.");
        var scope = ScopeKind(permission);
        if (scope is null && (row.GroupId is not null || row.FileId is not null))
            throw new InvalidDataException("هذه الصلاحية عامة ولا تقبل نطاقًا.");
        if (scope == "group" && (row.GroupId is null || row.FileId is not null))
            throw new InvalidDataException("صلاحية المجموعة تتطلب مجموعة واحدة فقط.");
        if (scope == "file" && (row.FileId is null || row.GroupId is not null))
            throw new InvalidDataException("صلاحية الملف تتطلب ملفًا واحدًا فقط.");
        if (scope == "groupOrFile" && ((row.GroupId is not null && row.FileId is not null)
            || (row.GroupId is null && row.FileId is null)))
            throw new InvalidDataException("حدد مجموعة أو ملفًا (وليس كليهما).");
    }

    private static string? ScopeKind(string permission) => permission switch
    {
        Permissions.GroupsViewScoped => "groupOrFile",
        "files.viewScoped" => "file",
        "search.scoped" => "groupOrFile",
        _ => null,
    };

    private async Task ValidateTargetsAsync(IReadOnlyList<PermissionAssignmentDto> rows, CancellationToken ct)
    {
        var groupIds = rows.Where(r => r.GroupId is not null).Select(r => r.GroupId!.Value).Distinct().ToList();
        if (groupIds.Count > 0)
        {
            var found = await uow.Groups.CountByIdsAsync(groupIds, ct);
            if (found != groupIds.Count) throw new InvalidOperationException("إحدى المجموعات المحددة غير موجودة.");
        }
        var fileIds = rows.Where(r => r.FileId is not null).Select(r => r.FileId!.Value).Distinct().ToList();
        if (fileIds.Count > 0)
        {
            var found = await uow.Files.CountByIdsAsync(fileIds, ct);
            if (found != fileIds.Count) throw new InvalidOperationException("إحدى الملفات المحددة غير موجودة.");
        }
    }

    private async Task<IReadOnlyList<PermissionAssignmentDto>> ResolveFileAssignmentsAsync(
        IReadOnlyList<PermissionAssignmentDto> rows, CancellationToken ct)
    {
        var all = rows.Any(r => r.Permission == Permissions.GroupsView && r.GroupId is null && r.FileId is null);
        var groupIds = rows
            .Where(r => r.Permission == Permissions.GroupsViewScoped && r.GroupId is not null)
            .Select(r => r.GroupId!.Value).Distinct().ToList();
        IReadOnlyList<Guid> files = all
            ? await uow.Files.AllFileIdsAsync(ct)
            : groupIds.Count > 0
                ? await uow.Files.FileIdsByGroupIdsAsync(groupIds, ct)
                : [];
        var seen = new HashSet<string>();
        var result = new List<PermissionAssignmentDto>();
        foreach (var row in rows.Where(r => r.Permission != Permissions.GroupsView
            && !(r.Permission == Permissions.GroupsViewScoped && r.GroupId is not null)))
        {
            if (seen.Add($"{row.Permission}|{row.GroupId}|{row.FileId}")) result.Add(row);
        }
        // Explicit global view-all grant (users page checkbox): persist it so
        // future files are covered, not just the snapshot below.
        var globalView = rows.FirstOrDefault(r => r.Permission == Permissions.GroupsView
            && r.GroupId is null && r.FileId is null);
        if (globalView is not null && seen.Add($"{globalView.Permission}||")) result.Add(globalView);
        foreach (var fileId in files)
        {
            var row = new PermissionAssignmentDto(Permissions.GroupsViewScoped, null, fileId);
            if (seen.Add($"{row.Permission}|{row.GroupId}|{row.FileId}")) result.Add(row);
        }
        return result;
    }

    private static IReadOnlyList<PermissionAssignmentDto> NormalizeAssignments(IEnumerable<PermissionAssignmentDto>? rows)
    {
        // V1 unifyDataPermissions parity: drop search.view/search.scoped, upgrade
        // files.viewScoped → groups.viewScoped, dedupe. search.view is derived at
        // check time from groups.view/viewScoped, never stored.
        var result = new List<PermissionAssignmentDto>();
        var seen = new HashSet<string>();
        foreach (var row in rows ?? [])
        {
            if (row.Permission == "search.view" || row.Permission == "search.scoped") continue;
            var permission = row.Permission == "files.viewScoped"
                ? Permissions.GroupsViewScoped
                : row.Permission;
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
