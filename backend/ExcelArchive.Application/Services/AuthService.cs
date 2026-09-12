using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Security;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Entities;

namespace ExcelArchive.Application.Services;

/// <summary>
/// Application authentication orchestration over repositories and security
/// contracts. HTTP (cookies, HttpContext cache) stays in API; password and
/// session cryptography stay in Infrastructure security implementations.
/// </summary>
public class AuthService(
    IUnitOfWork uow,
    IPasswordHasher passwords,
    ISessionTokenService sessions,
    IScopedArchiveQuery scopes) : IAuthService
{
    public string CreateSessionToken(User user) => sessions.CreateSessionToken(user);

    public SessionPayload? ValidateSessionToken(string? token) => sessions.ValidateSessionToken(token);

    public bool VerifyPassword(string password, string storedHash) => passwords.VerifyPassword(password, storedHash);

    public string HashPassword(string password) => passwords.HashPassword(password);

    public async Task<CurrentUserDto?> GetSessionUserAsync(string? sessionToken, CancellationToken ct = default)
    {
        var payload = ValidateSessionToken(sessionToken);
        if (payload is null) return null;

        var user = await uow.Users.FindWithPermissionsAsync(payload.UserId, ct);
        // V1 parity: inactive users and username mismatch (rename) invalidate the session.
        if (user is null || !user.IsActive) return null;
        if (!string.Equals(user.Username, payload.Username, StringComparison.Ordinal)) return null;

        return new CurrentUserDto(user.Id, user.Username, user.DisplayName,
            UnifyDataPermissions(user.Permissions.Select(p => new PermissionDto(p.Permission, p.GroupId, p.FileId))).ToList());
    }

    public async Task<(User User, string Token)?> LoginAsync(string username, string password, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password)) return null;
        var user = await uow.Users.FindByUsernameAsync(username.Trim(), ct);
        if (user is null || !user.IsActive || !VerifyPassword(password, user.PasswordHash)) return null;
        return (user, CreateSessionToken(user));
    }

    /// <summary>
    /// V1 lib/auth/permissions.unifyDataPermissions: drop legacy search grants,
    /// upgrade files.viewScoped → groups.viewScoped, dedupe. Scoped rows never
    /// satisfy a global check (enforced in HasPermission).
    /// </summary>
    public static IReadOnlyList<PermissionDto> UnifyDataPermissions(IEnumerable<PermissionDto> rows)
    {
        var seen = new HashSet<string>();
        var result = new List<PermissionDto>();
        foreach (var row in rows)
        {
            if (row.Permission == "search.view" || row.Permission == "search.scoped") continue;
            var next = row.Permission == "files.viewScoped"
                ? row with { Permission = Permissions.GroupsViewScoped }
                : row;
            var key = $"{next.Permission}|{next.GroupId}|{next.FileId}";
            if (seen.Add(key)) result.Add(next);
        }
        return result;
    }

    public bool HasPermission(CurrentUserDto user, string key)
    {
        // Normalize first so legacy files.viewScoped/search.* rows behave like V1
        // even when the caller passes a non-normalized DTO (tests, cached users).
        var perms = UnifyDataPermissions(user.Permissions);
        // Legacy alias: groups.manage was an architecture-only extra; treat it as
        // groups.view so pre-existing grants keep working and vice versa.
        if (key == Permissions.GroupsManage) key = Permissions.GroupsView;
        if (key == Permissions.SearchView || key == "search.view")
        {
            return perms.Any(p =>
                (p.Permission == Permissions.GroupsView && p.GroupId is null && p.FileId is null) ||
                (p.Permission == Permissions.GroupsViewScoped && (p.GroupId is not null || p.FileId is not null)) ||
                (p.Permission == Permissions.GroupsManage && p.GroupId is null && p.FileId is null));
        }
        if (key == Permissions.GroupsView)
        {
            return perms.Any(p =>
                (p.Permission == Permissions.GroupsView && p.GroupId is null && p.FileId is null) ||
                (p.Permission == Permissions.GroupsManage && p.GroupId is null && p.FileId is null));
        }
        // Fine-grained group management: legacy groups.view / groups.manage
        // grants keep full management power so existing admins lose nothing.
        if (key == Permissions.GroupsCreate || key == Permissions.GroupsUpdate)
        {
            return perms.Any(p =>
                (p.Permission == key && p.GroupId is null && p.FileId is null) ||
                (p.Permission == Permissions.GroupsView && p.GroupId is null && p.FileId is null) ||
                (p.Permission == Permissions.GroupsManage && p.GroupId is null && p.FileId is null));
        }
        return perms.Any(p =>
            p.Permission == key && p.GroupId is null && p.FileId is null);
    }

    public Task<DataScopeDto> ResolveDataScope(CurrentUserDto user, CancellationToken ct = default)
        => scopes.ResolveAsync(user, ct);
}
