using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Domain.Entities;

namespace ExcelArchive.Application.Interfaces.Security;

/// <summary>
/// Session token signing/validation (PBKDF2-derived HMAC key, 12h lifetime,
/// dual username claims). Stateless: safe to register as Singleton; secret
/// rotation invalidates cached keys. HTTP cookie handling stays in API.
/// </summary>
public interface ISessionTokenService
{
    string CreateSessionToken(User user);
    SessionPayload? ValidateSessionToken(string? token);
}
