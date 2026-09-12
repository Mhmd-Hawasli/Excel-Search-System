using ExcelArchive.Application.DTOs.ExcelDto;
using ExcelArchive.Application.DTOs.FileDto;
using ExcelArchive.Application.DTOs.UploadDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface IFileService
{
    Task<(bool Available, string? Error)> CheckNameAsync(string name, CancellationToken ct = default);
    Task<FileDto?> GetAsync(Guid fileId, CancellationToken ct = default);
    Task<FileDetailDto?> GetDetailAsync(Guid fileId, bool includeEdits, CancellationToken ct = default);
    Task<FileQualityDto?> GetQualityAsync(Guid fileId, CancellationToken ct = default);
    Task<FileMappingDto?> GetMappingAsync(Guid fileId, CancellationToken ct = default);
    Task<int> UpdateMappingAsync(Guid fileId, UpdateMappingRequest request, string actorUsername, CancellationToken ct = default);
    Task DeleteAsync(Guid fileId, string confirmName, string actorUsername, CancellationToken ct = default);
    Task<bool> ExistsAsync(Guid fileId, CancellationToken ct = default);
    Task<FileExportDataDto?> GetExportDataAsync(Guid fileId, CancellationToken ct = default);
    Task<Guid> CreateReplaceJobAsync(Guid fileId, ReplaceFileRequest request, string actorUsername, CancellationToken ct = default);
}
