using ExcelArchive.Application.DTOs.MergeDto;
using ExcelArchive.Domain.Merge;

namespace ExcelArchive.Application.Interfaces.Services;

public interface IMergeService
{
    MergeInspection Inspect(byte[] content, string fileName);
    MergeSelectedSheet InspectSheet(Guid token, string sheetName);
    IReadOnlyDictionary<string, int> SuggestMapping(IReadOnlyList<string> headers);
    MergeRunResult Run(MergeRunArgs args, Action<int, string?>? onProgress = null);
    (MergeSessionData Session, MergeResult Result) DeleteKey(Guid sessionId, string table, int rowNumber);
    MergeSessionData GetSession(Guid sessionId);
    (byte[] Bytes, string Filename) ExportScoped(Guid sessionId, string scope);
    Task<MergeExportReadyResult> PrepareExportAsync(
        Guid sessionId, string scope,
        Action<int, string?>? onProgress = null, CancellationToken ct = default);
    (byte[] Bytes, string Filename, long Size) DownloadExport(Guid downloadId);
}
