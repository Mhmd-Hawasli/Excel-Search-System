using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Auth;
using ExcelArchive.Api.Models.Entities;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace ExcelArchive.Api.Services;

public class AuthService(AppDbContext db, IConfiguration configuration) : IAuthService
{
    public const string SessionCookieName = "excel_archive_session";
    private const int SaltLength = 16;
    private const int HashLength = 64;
    private const int Iterations = 210_000;

    private static readonly SymmetricSecurityKey DevKey =
        new(Encoding.UTF8.GetBytes("excel-archive-search/dev-only-session-secret-change-me"));

    private SymmetricSecurityKey SigningKey
    {
        get
        {
            var secret = configuration["SESSION_SECRET"] ?? "";
            if (secret.Length >= 32) return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
            return configuration["ASPNETCORE_ENVIRONMENT"] == "Production"
                ? throw new InvalidOperationException("SESSION_SECRET is not set. Set a random secret >= 32 chars.")
                : DevKey;
        }
    }

    public string CreateSessionToken(User user)
    {
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
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
                IssuerSigningKey = SigningKey,
            }, out _);
            var sub = principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
            var name = principal.FindFirstValue(JwtRegisteredClaimNames.UniqueName);
            if (!Guid.TryParse(sub, out var userId) || string.IsNullOrWhiteSpace(name)) return null;
            return new SessionPayload(userId, name);
        }
        catch
        {
            return null;
        }
    }

    public bool VerifyPassword(string password, string storedHash)
    {
        var parts = storedHash.Split('$');
        if (parts.Length != 5 || parts[0] != "pbkdf2") return false;
        if (!int.TryParse(parts[2], out var iterations) || iterations <= 0) return false;
        var salt = Convert.FromBase64String(parts[3]);
        var expected = Convert.FromBase64String(parts[4]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, HashLength);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    public string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltLength);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, HashLength);
        return $"pbkdf2$v1${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public async Task<CurrentUserDto?> GetCurrentUser(HttpContext httpContext, CancellationToken ct = default)
    {
        var cookie = httpContext.Request.Cookies[SessionCookieName];
        var payload = ValidateSessionToken(cookie);
        if (payload is null) return null;

        if (httpContext.Items.TryGetValue("CurrentUser", out var cached) && cached is CurrentUserDto cachedUser)
            return cachedUser;

        var user = await db.Users.Include(u => u.Permissions)
            .FirstOrDefaultAsync(u => u.Id == payload.UserId, ct);
        if (user is null || !user.IsActive) return null;

        var dto = new CurrentUserDto(user.Id, user.Username, user.DisplayName,
            user.Permissions.Select(p => new PermissionDto(p.Permission, p.GroupId, p.FileId)).ToList());
        httpContext.Items["CurrentUser"] = dto;
        return dto;
    }

    public bool HasPermission(CurrentUserDto user, string key)
    {
        // The legacy "search.*" permissions were folded into groups.view/viewScoped.
        if (key == "search.view")
        {
            return user.Permissions.Any(p =>
                (p.Permission == Permissions.GroupsView && p.GroupId is null && p.FileId is null) ||
                (p.Permission == Permissions.GroupsViewScoped && (p.GroupId is not null || p.FileId is not null)));
        }
        return user.Permissions.Any(p =>
            p.Permission == key && p.GroupId is null && p.FileId is null);
    }

    public async Task<DataScopeDto> ResolveDataScope(CurrentUserDto user, CancellationToken ct = default)
    {
        if (HasPermission(user, Permissions.GroupsView)) return new DataScopeDto { GroupIds = null, FileIds = null };

        var groups = new HashSet<Guid>();
        var files = new HashSet<Guid>();
        foreach (var row in user.Permissions.Where(p => p.Permission == Permissions.GroupsViewScoped))
        {
            if (row.GroupId is not null) groups.Add(row.GroupId.Value);
            if (row.FileId is not null) files.Add(row.FileId.Value);
        }

        if (groups.Count > 0)
        {
            var fileIds = await db.Files.AsNoTracking()
                .Where(f => groups.Contains(f.GroupId))
                .Select(f => f.Id)
                .ToListAsync(ct);
            foreach (var id in fileIds) files.Add(id);
        }

        if (files.Count > 0)
        {
            var groupIds = await db.Files.AsNoTracking()
                .Where(f => files.Contains(f.Id))
                .Select(f => f.GroupId)
                .ToListAsync(ct);
            foreach (var id in groupIds) groups.Add(id);
        }

        return new DataScopeDto { GroupIds = groups.ToList(), FileIds = files.ToList() };
    }
}
