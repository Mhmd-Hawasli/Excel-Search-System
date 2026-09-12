namespace ExcelArchive.Application.Interfaces.Storage;

/// <summary>
/// Durable upload-file storage keyed by opaque tokens, plus format-sidecar
/// persistence. Core byte operations only; sidecar payload types cross via
/// DTOs (P5). Stateless file handling: safe to register as Singleton.
/// </summary>
public interface IWorkbookFileStore
{
    string PathFor(string token);
    Task<string> SaveAsync(string fileName, byte[] bytes, CancellationToken ct = default);
    Task<byte[]> LoadAsync(string token, CancellationToken ct = default);
    void Remove(string token);
    void PruneStale(TimeSpan? maxAge = null);
}
