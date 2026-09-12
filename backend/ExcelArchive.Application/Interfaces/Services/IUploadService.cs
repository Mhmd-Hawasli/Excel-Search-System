using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.UploadDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface IUploadService
{
    Task<CreateUploadJobResponse> CreateJobAsync(CreateUploadJobRequest request, string actorUsername, CancellationToken ct = default);
    Task<UploadJobDto?> GetJobAsync(Guid id, CancellationToken ct = default);
    Task<SaveTemplateResponse> SaveTemplateAsync(Guid jobId, SaveTemplateRequest request, string actorUsername, CancellationToken ct = default);
    Task<IReadOnlyList<MappingTemplateDto>> ListTemplatesAsync(Guid? groupId, DataScopeDto scope, CancellationToken ct = default);
}
