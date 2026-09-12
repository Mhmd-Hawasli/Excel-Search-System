using System.Security.Cryptography;
using System.Text;

namespace ExcelArchive.Foundation.Tests;

/// <summary>
/// P1.3 scrypt verification tests. Known vector generated with Node
/// crypto.scrypt (N=16384,r=8,p=1, salt 001122..eeff). Frozen contract.
/// </summary>
public sealed class PasswordTests
{
    private const string KnownSaltB64 = "ABEiM0RVZneImaq7zN3u/w==";
    private const string KnownHashB64 = "gEFKWv0KiKRgsUL7cjJcBR9yD9ApGIlNKJMXuvxtDOyJGazWZINl3sS6pAEhKJSHllKp5nui9QWvEXRb1y+adg==";
    private static string KnownStored => $"scrypt$v1$n=16384$r=8$p=1${KnownSaltB64}${KnownHashB64}";

    private static bool Verify(string password, string stored)
    {
        using var db = TestHelpers.InMemoryDb();
        return TestHelpers.Auth(db).VerifyPassword(password, stored);
    }

    [Fact]
    public void VerifiesKnownV1Vector() => Assert.True(Verify("mhmd123", KnownStored));

    [Fact]
    public void RejectsWrongPassword() => Assert.False(Verify("mhmd124", KnownStored));

    [Fact]
    public void RejectsEmptyPassword() => Assert.False(Verify("", KnownStored));

    [Fact]
    public void RejectsMalformedHashes()
    {
        Assert.False(Verify("mhmd123", "not-a-hash"));
        Assert.False(Verify("mhmd123", "scrypt$v1$n=1$r=1$p=1$AA$BB"));
        Assert.False(Verify("mhmd123", ""));
    }

    [Fact]
    public void HashRoundTrip_PreservesWhitespaceAndUnicode()
    {
        using var db = TestHelpers.InMemoryDb();
        var auth = TestHelpers.Auth(db);
        foreach (var password in new[] { "simple123", "  spaced  ", "كلمة مرور 123", "a\tb\nc" })
        {
            var stored = auth.HashPassword(password);
            Assert.StartsWith("scrypt$v1$n=16384$r=8$p=1$", stored);
            Assert.True(auth.VerifyPassword(password, stored), $"round-trip failed for '{password}'");
            Assert.False(auth.VerifyPassword(password.Trim() + "_other", stored));
        }
    }

    [Fact]
    public void DispatchesLegacyPbkdf2Hashes()
    {
        using var db = TestHelpers.InMemoryDb();
        var auth = TestHelpers.Auth(db);
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes("legacy-pass"), salt, 210_000, HashAlgorithmName.SHA256, 64);
        var stored = $"pbkdf2$v1$210000${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
        Assert.True(auth.VerifyPassword("legacy-pass", stored));
        Assert.False(auth.VerifyPassword("legacy-pasx", stored));
        Assert.False(auth.VerifyPassword("legacy-pass", "pbkdf2$v1$bad$AA$BB"));
    }
}
