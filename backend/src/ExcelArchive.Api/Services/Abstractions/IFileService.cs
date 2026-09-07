using ExcelArchive.Api.DTOs.Files;

namespace ExcelArchive.Api.Services.Abstractions;

public interface IFileService
{
    Task<(bool Available, string? Error)> CheckNameAsync(string name, CancellationToken ct = default);
    Task<FileMappingDto?> GetMappingAsync(Guid fileId, CancellationToken ct = default);
    Task<FileMappingDto> UpdateMappingAsync(Guid fileId, UpdateMappingRequest request, CancellationToken ct = default);
    Task DeleteAsync(Guid fileId, string confirmName, string actorUsername, CancellationToken ct = default);
}
