using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Interfaces.Security;
using ExcelArchive.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace ExcelArchive.Infrastructure.Implementations.Security;

/// <summary>
/// Session token signing/validation. V1 session-signing derivation
/// (lib/auth/config.ts): PBKDF2-SHA256, 210k iterations, salt
/// excel-archive-search/session-signing/v1, 256-bit HMAC key.
/// Distinct from password hashing. Cached per secret so rotation invalidates tokens.
/// </summary>
public sealed class SessionTokenService(IConfiguration configuration) : ISessionTokenService
{
    private const int Pbkdf2Iterations = 210_000;

    private static readonly object KeyCacheLock = new();
    private static string? CachedSecret;
    private static SymmetricSecurityKey? CachedKey;
    private static readonly byte[] SigningSalt =
        Encoding.UTF8.GetBytes("excel-archive-search/session-signing/v1");

    private SymmetricSecurityKey SigningKey
    {
        get
        {
            var secret = configuration["SESSION_SECRET"] ?? "";
            var isProduction = string.Equals(
                configuration["ASPNETCORE_ENVIRONMENT"], "Production", StringComparison.OrdinalIgnoreCase);
            if (secret.Length < 32)
            {
                if (isProduction)
                    throw new InvalidOperationException("SESSION_SECRET is not set. Set a random secret >= 32 chars.");
                secret = "excel-archive-search/dev-only-session-secret-change-me";
            }
            lock (KeyCacheLock)
            {
                if (CachedKey is not null && CachedSecret == secret) return CachedKey;
                var keyBytes = Rfc2898DeriveBytes.Pbkdf2(
                    Encoding.UTF8.GetBytes(secret), SigningSalt, Pbkdf2Iterations,
                    HashAlgorithmName.SHA256, 32);
                CachedSecret = secret;
                CachedKey = new SymmetricSecurityKey(keyBytes);
                return CachedKey;
            }
        }
    }

    public string CreateSessionToken(User user)
    {
        var now = DateTime.UtcNow;
        // Emit both `username` (V1 canonical, jose) and `unique_name` (existing V2
        // readers) so tokens verify on both sides. Cutover without forced re-login
        // still requires the PBKDF2-derived signing key above to match V1.
        var token = new JwtSecurityToken(
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim("username", user.Username),
                new Claim(JwtRegisteredClaimNames.UniqueName, user.Username),
            ],
            notBefore: now,
            expires: now.AddHours(12),
            signingCredentials: new SigningCredentials(SigningKey, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public SessionPayload? ValidateSessionToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        try
        {
            var handler = new JwtSecurityTokenHandler();
            var principal = handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = false,
                ValidateAudience = false,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = SigningKey,
            }, out _);
            // NOTE: JwtSecurityTokenHandler maps "sub" -> NameIdentifier and
            // "unique_name" -> Name by default, so check both mapped and raw types.
            // V1 issues `username`; existing V2 sessions carry `unique_name`.
            var sub = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirst("sub")?.Value;
            var name = principal.FindFirst("username")?.Value
                ?? principal.FindFirstValue(ClaimTypes.Name)
                ?? principal.FindFirstValue(JwtRegisteredClaimNames.UniqueName)
                ?? principal.FindFirst("unique_name")?.Value;
            if (!Guid.TryParse(sub, out var userId) || string.IsNullOrWhiteSpace(name)) return null;
            return new SessionPayload(userId, name);
        }
        catch
        {
            return null;
        }
    }
}
