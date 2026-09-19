using ExcelArchive.Application.DTOs.FileDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface IReplacePreviewService
{
    /// <summary>Compares every cell of the staged workbook (token) against the
    /// current stored rows. Fast path: single Excel read + single DB round-trip
    /// + O(cells) ordinal compares, capped sample list. Throws
    /// InvalidDataException / KeyNotFoundException on bad input.</summary>
    Task<ReplacePreviewResponse> PreviewAsync(
        Guid fileId, ReplaceFileRequest request, CancellationToken ct = default);
}
