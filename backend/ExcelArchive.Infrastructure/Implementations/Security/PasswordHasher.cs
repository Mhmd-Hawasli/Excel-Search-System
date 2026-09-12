using System.Security.Cryptography;
using System.Text;
using ExcelArchive.Application.Interfaces.Security;

namespace ExcelArchive.Infrastructure.Implementations.Security;

/// <summary>
/// Password hashing. New hashes use V1 scrypt; pbkdf2$v1 legacy hashes still verify.
/// Password whitespace and unicode preserved - UTF8 bytes, never trimmed.
/// </summary>
public sealed class PasswordHasher : IPasswordHasher
{
    private const int SaltLength = 16;
    private const int HashLength = 64;
    private const int Pbkdf2Iterations = 210_000;

    public bool VerifyPassword(string password, string storedHash)
    {
        // Dispatch by stored format: scrypt$v1 (V1 + all new V2 hashes) or
        // pbkdf2$v1 (already-created V2 accounts).
        if (storedHash.StartsWith("scrypt$v1$", StringComparison.Ordinal))
        {
            if (!ScryptHelper.TryDecodeV1(storedHash, out var salt, out var expected)) return false;
            var actual = ScryptHelper.DeriveKey(
                Encoding.UTF8.GetBytes(password), salt,
                ScryptHelper.N, ScryptHelper.R, ScryptHelper.P, ScryptHelper.KeyLength);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        try
        {
            var parts = storedHash.Split('$');
            if (parts.Length != 5 || parts[0] != "pbkdf2") return false;
            if (!int.TryParse(parts[2], out var iterations) || iterations <= 0) return false;
            var salt = Convert.FromBase64String(parts[3]);
            var expected = Convert.FromBase64String(parts[4]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(
                Encoding.UTF8.GetBytes(password), salt, iterations, HashAlgorithmName.SHA256, HashLength);
            return actual.Length == expected.Length && CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch { return false; }
    }

    public string HashPassword(string password)
    {
        // New hashes use V1 scrypt so migrated and new accounts share one verifier.
        var salt = RandomNumberGenerator.GetBytes(SaltLength);
        var hash = ScryptHelper.HashUtf8(password, salt);
        return ScryptHelper.EncodeV1(salt, hash);
    }
}
