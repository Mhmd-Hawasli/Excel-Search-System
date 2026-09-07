using ExcelArchive.Api.DTOs.Upload;

namespace ExcelArchive.Api.Services.Abstractions;

public interface IUploadService
{
    Task<CreateUploadJobResponse> CreateJobAsync(CreateUploadJobRequest request, string actorUsername, CancellationToken ct = default);
    Task<UploadJobDto?> GetJobAsync(Guid id, CancellationToken ct = default);
    Task<SaveTemplateResponse> SaveTemplateAsync(Guid jobId, SaveTemplateRequest request, string actorUsername, CancellationToken ct = default);
    Task<IReadOnlyDictionary<string, object?>> InspectAsync(Stream stream, string fileName, CancellationToken ct = default);
}
