using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using System.Text;
using ExcelArchive.Domain.Entities;
using Microsoft.IdentityModel.Tokens;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P1.3 session/JWT tests. Key-derivation vector generated with Node
/// WebCrypto PBKDF2-SHA256 (210k, salt excel-archive-search/session-signing/v1).</summary>
public sealed class SessionTests
{
    private const string VectorSecret = "test-secret-with-at-least-32-characters!";
    private const string VectorKeyHex = "6e49bc4a4dfed2f2c7fae86c41fa44d5f64e66d07dd38863449bb6e94355cc94";

    private static User TestUser(string username = "alice")
        => new() { Id = Guid.NewGuid(), Username = username, PasswordHash = "unused", IsActive = true };

    [Fact]
    public void SigningKeyDerivation_MatchesV1Vector()
    {
        var key = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(VectorSecret),
            Encoding.UTF8.GetBytes("excel-archive-search/session-signing/v1"),
            210_000, HashAlgorithmName.SHA256, 32);
        Assert.Equal(VectorKeyHex, Convert.ToHexString(key).ToLowerInvariant());
    }

    [Fact]
    public void TokenRoundTrip_PreservesIdentity()
    {
        using var db = TestHelpers.InMemoryDb();
        var auth = TestHelpers.Auth(db);
        var user = TestUser();
        var token = auth.CreateSessionToken(user);
        var payload = auth.ValidateSessionToken(token);
        Assert.NotNull(payload);
        Assert.Equal(user.Id, payload.UserId);
        Assert.Equal(user.Username, payload.Username);
    }

    [Fact]
    public void Token_CarriesBothUsernameClaims_AndTwelveHourLifetime()
    {
        using var db = TestHelpers.InMemoryDb();
        var auth = TestHelpers.Auth(db);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(auth.CreateSessionToken(TestUser()));
        Assert.Contains(jwt.Claims, c => c.Type == "username" && c.Value == "alice");
        Assert.Contains(jwt.Claims, c => c.Type is "unique_name" or "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name" && c.Value == "alice");
        Assert.Equal("HS256", jwt.Header.Alg);
        Assert.InRange((jwt.ValidTo - jwt.ValidFrom).TotalHours, 11.9, 12.1);
    }

    [Fact]
    public void WrongSecret_RejectsToken()
    {
        using var db = TestHelpers.InMemoryDb();
        var token = TestHelpers.Auth(db, TestHelpers.Config("first-secret-with-at-least-32-characters!"))
            .CreateSessionToken(TestUser());
        Assert.Null(TestHelpers.Auth(db, TestHelpers.Config("second-secret-with-at-least-32-characters"))
            .ValidateSessionToken(token));
    }

    [Fact]
    public void TamperedAndEmptyTokens_Rejected()
    {
        using var db = TestHelpers.InMemoryDb();
        var auth = TestHelpers.Auth(db);
        var token = auth.CreateSessionToken(TestUser());
        Assert.Null(auth.ValidateSessionToken(token[..^2] + (token[^2] == 'a' ? "bb" : "aa")));
        Assert.Null(auth.ValidateSessionToken(null));
        Assert.Null(auth.ValidateSessionToken(""));
        Assert.Null(auth.ValidateSessionToken("   "));
        Assert.Null(auth.ValidateSessionToken("not-a-jwt"));
    }

    [Fact]
    public void ExpiredToken_Rejected()
    {
        using var db = TestHelpers.InMemoryDb();
        var config = TestHelpers.Config();
        var auth = TestHelpers.Auth(db, config);
        var user = TestUser();
        var keyBytes = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(TestHelpers.DevSecret),
            Encoding.UTF8.GetBytes("excel-archive-search/session-signing/v1"),
            210_000, HashAlgorithmName.SHA256, 32);
        var expired = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            claims: [new System.Security.Claims.Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                     new System.Security.Claims.Claim("username", user.Username)],
            notBefore: DateTime.UtcNow.AddHours(-3),
            expires: DateTime.UtcNow.AddHours(-2),
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(keyBytes), SecurityAlgorithms.HmacSha256)));
        Assert.Null(auth.ValidateSessionToken(expired));
    }

    [Fact]
    public void ProductionMissingSecret_Throws()
    {
        using var db = TestHelpers.InMemoryDb();
        var auth = TestHelpers.Auth(db, TestHelpers.Config(secret: null, environment: "Production"));
        Assert.Throws<InvalidOperationException>(() => auth.CreateSessionToken(TestUser()));
    }

    [Fact]
    public void DevFallback_WorksWithoutSecret()
    {
        using var db = TestHelpers.InMemoryDb();
        var auth = TestHelpers.Auth(db, TestHelpers.Config(secret: null, environment: "Development"));
        var payload = auth.ValidateSessionToken(auth.CreateSessionToken(TestUser()));
        Assert.NotNull(payload);
    }
}
