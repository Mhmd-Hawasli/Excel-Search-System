using ExcelArchive.Application.Common.Context;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.AuthDto;

namespace ExcelArchive.Api.Common.Context;

/// <summary>Scoped <see cref="ICurrentUser"/> resolved from the auth middleware item.</summary>
public sealed class HttpCurrentUser(IHttpContextAccessor accessor, IAuthService auth) : ICurrentUser
{
    private CurrentUserDto? _user;

    private CurrentUserDto? User
    {
        get
        {
            if (_user is not null) return _user;
            var ctx = accessor.HttpContext;
            _user = ctx?.Items["CurrentUser"] as CurrentUserDto;
            return _user;
        }
    }

    public Guid? UserId => User?.Id;
    public string? Username => User?.Username;
    public string? DisplayName => User?.DisplayName;
    public bool IsAuthenticated => User is not null;
    public IReadOnlySet<string> Permissions =>
        User?.Permissions.Select(p => p.Permission).ToHashSet() ?? new HashSet<string>();
    public IReadOnlyList<Guid>? GroupIds => null;
    public IReadOnlyList<Guid>? FileIds => null;

    public bool HasPermission(string key)
    {
        var user = User;
        return user is not null && auth.HasPermission(user, key);
    }
}
