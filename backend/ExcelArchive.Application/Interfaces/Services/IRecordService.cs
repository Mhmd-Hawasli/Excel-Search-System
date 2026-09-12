using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.RecordDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface IRecordService
{
    Task<RecordDetailDto?> GetDetailAsync(Guid recordId, CurrentUserDto user, CancellationToken ct = default);
    Task<Guid?> GetFileIdAsync(Guid recordId, CancellationToken ct = default);
}
