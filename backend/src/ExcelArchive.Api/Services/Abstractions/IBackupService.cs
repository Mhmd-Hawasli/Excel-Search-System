namespace ExcelArchive.Api.Services.Abstractions;

public interface IBackupService
{
    Task<byte[]> ExportAsync(CancellationToken ct = default);
    Task<IReadOnlyDictionary<string, int>> RestoreAsync(Stream jsonStream, string actorUsername, CancellationToken ct = default);
}
