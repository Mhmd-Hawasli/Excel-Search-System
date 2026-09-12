using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Application.Interfaces.Services;

namespace ExcelArchive.Application.Interfaces.Services;

/// <summary>Scoped execution of one upload job (claim is owned by the worker loop).</summary>
public interface IUploadJobProcessor
{
    Task ProcessAsync(Guid jobId, CancellationToken ct = default);
}
