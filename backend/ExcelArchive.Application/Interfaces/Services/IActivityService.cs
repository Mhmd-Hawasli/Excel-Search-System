using ExcelArchive.Application.DTOs.ActivityDto;
using ExcelArchive.Domain.Enums;

namespace ExcelArchive.Application.Interfaces.Services;

public interface IActivityService
{
    Task<ActivityResult> ListAsync(ActivityFilterRequest request, CancellationToken ct = default);
    Task WriteAsync(ActivityAction action, string targetName, object? details = null, CancellationToken ct = default);
}
