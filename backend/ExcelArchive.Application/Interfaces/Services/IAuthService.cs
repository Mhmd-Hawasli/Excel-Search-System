using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Domain.Entities;

namespace ExcelArchive.Application.Interfaces.Services;

public interface IAuthService
{
    string CreateSessionToken(User user);
    SessionPayload? ValidateSessionToken(string? token);
    bool VerifyPassword(string password, string storedHash);
    string HashPassword(string password);

    /// <summary>Validates the session token and loads the current user. No HTTP types cross this boundary.</summary>
    Task<CurrentUserDto?> GetSessionUserAsync(string? sessionToken, CancellationToken ct = default);

    /// <summary>Username/password login: lookup, active check, password verify, token issue.</summary>
    Task<(User User, string Token)?> LoginAsync(string username, string password, CancellationToken ct = default);

    bool HasPermission(CurrentUserDto user, string key);
    Task<DataScopeDto> ResolveDataScope(CurrentUserDto user, CancellationToken ct = default);
}
