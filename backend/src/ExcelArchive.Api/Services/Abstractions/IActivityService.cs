using ExcelArchive.Api.DTOs.Activity;
using ExcelArchive.Api.Models.Enums;

namespace ExcelArchive.Api.Services.Abstractions;

public interface IActivityService
{
    Task<ActivityResult> ListAsync(ActivityFilterRequest request, CancellationToken ct = default);
    Task WriteAsync(ActivityAction action, string targetName, object? details = null, CancellationToken ct = default);
}
