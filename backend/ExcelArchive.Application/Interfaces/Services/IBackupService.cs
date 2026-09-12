namespace ExcelArchive.Application.Interfaces.Services;

public interface IBackupService
{
    Task<byte[]> ExportAsync(CancellationToken ct = default);
    Task<IReadOnlyDictionary<string, int>> RestoreAsync(Stream jsonStream, string actorUsername, CancellationToken ct = default);
    /// <summary>Protected full-system transfer (P6.4): user accounts with
    /// compatible password hashes, explicit permission grants and ignored
    /// conflicts. Separate from the V1-compatible archive backup.</summary>
    Task<byte[]> ExportAccountsAsync(CancellationToken ct = default);
    Task<IReadOnlyDictionary<string, int>> ImportAccountsAsync(Stream jsonStream, string actorUsername, CancellationToken ct = default);
}
