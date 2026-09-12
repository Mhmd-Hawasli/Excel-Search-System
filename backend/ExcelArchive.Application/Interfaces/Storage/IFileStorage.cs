namespace ExcelArchive.Application.Interfaces.Storage;

/// <summary>Temporary file storage for workbook uploads/previews (Phase 2 seam).</summary>
public interface IFileStorage
{
    Task<string> SaveTempAsync(Stream content, string fileName, CancellationToken ct = default);
    Stream OpenRead(string path);
    void Delete(string path);
    string TempDirectory { get; }
}
