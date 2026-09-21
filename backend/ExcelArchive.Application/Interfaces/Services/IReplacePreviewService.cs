using ExcelArchive.Application.DTOs.FileDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface IReplacePreviewService
{
    /// <summary>Compares every cell of the staged workbook (token) against the
    /// current stored rows. Fast path: single Excel read + single DB round-trip
    /// + O(cells) ordinal compares. Returns the full change list (up to 50k,
    /// manual-first) so the UI can paginate locally. Throws
    /// InvalidDataException / KeyNotFoundException on bad input.</summary>
    Task<ReplacePreviewResponse> PreviewAsync(
        Guid fileId, ReplaceFileRequest request, CancellationToken ct = default);
}
