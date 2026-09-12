namespace ExcelArchive.Application.Interfaces.Security;

/// <summary>
/// Password hashing with support for legacy formats (scrypt V1).
/// Stateless: safe to register as Singleton.
/// </summary>
public interface IPasswordHasher
{
    string HashPassword(string password);
    bool VerifyPassword(string password, string storedHash);
}
