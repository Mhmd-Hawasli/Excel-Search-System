using ExcelArchive.Application.DTOs.BulkSearchDto;

namespace ExcelArchive.Application.Interfaces.Services;

/// <summary>Bulk search over an uploaded Excel value list (البحث الجماعي).</summary>
public interface IBulkSearchService
{
    BulkSearchInspection Inspect(byte[] content, string fileName);
    BulkSearchSelectedSheet InspectSheet(Guid token, string sheetName);
    Task<BulkSearchResult> RunAsync(
        BulkSearchRunArgs args,
        IReadOnlyList<Guid> groupIds,
        IReadOnlyList<Guid> fileIds,
        IReadOnlyList<Guid>? allowedFileIds,
        Action<int, string?>? onProgress = null,
        CancellationToken ct = default);
}
