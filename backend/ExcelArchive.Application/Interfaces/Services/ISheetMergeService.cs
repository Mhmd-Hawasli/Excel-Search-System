using ExcelArchive.Application.DTOs.SheetMergeDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface ISheetMergeService
{
    Task<SheetMergeUploadResult> UploadAsync(
        byte[] content, string fileName,
        Action<int, string?>? onProgress = null, CancellationToken ct = default);
    Task<SheetMergeRunResult> RunAsync(
        Guid uploadId, int nationalIdColumn, IReadOnlyList<string> sheetNames,
        Action<int, string?>? onProgress = null, CancellationToken ct = default);
    Task<SheetMergeReadyResult> PrepareExportAsync(
        Guid sessionId, Action<int, string?>? onProgress = null, CancellationToken ct = default);
    (byte[] Bytes, string Filename, long Size) Download(Guid downloadId);
}
