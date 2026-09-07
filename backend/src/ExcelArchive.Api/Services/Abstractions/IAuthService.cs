using ExcelArchive.Api.DTOs.Auth;
using ExcelArchive.Api.Models.Entities;

namespace ExcelArchive.Api.Services.Abstractions;

public interface IAuthService
{
    string CreateSessionToken(User user);
    SessionPayload? ValidateSessionToken(string? token);
    bool VerifyPassword(string password, string storedHash);
    string HashPassword(string password);
    Task<CurrentUserDto?> GetCurrentUser(HttpContext httpContext, CancellationToken ct = default);
    bool HasPermission(CurrentUserDto user, string key);
    Task<DataScopeDto> ResolveDataScope(CurrentUserDto user, CancellationToken ct = default);
}

public record SessionPayload(Guid UserId, string Username);

public record DataScopeDto
{
    public IReadOnlyList<Guid>? GroupIds { get; init; }
    public IReadOnlyList<Guid>? FileIds { get; init; }
}
