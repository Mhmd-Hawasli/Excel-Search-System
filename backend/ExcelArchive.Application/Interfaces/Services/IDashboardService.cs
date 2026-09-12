using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.DashboardDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface IDashboardService
{
    Task<DashboardDto> GetAsync(CurrentUserDto user, CancellationToken ct = default);
}
