using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.RecordDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface IRecordService
{
    Task<RecordDetailDto?> GetDetailAsync(Guid recordId, CurrentUserDto user, CancellationToken ct = default);
    Task<Guid?> GetFileIdAsync(Guid recordId, CancellationToken ct = default);

    // Manual insert (إدخال سجل جديد).
    Task<ManualRecordTemplateDto?> GetTemplateAsync(Guid fileId, CurrentUserDto user, CancellationToken ct = default);
    Task<ManualRecordCreatedDto> CreateManualAsync(Guid fileId, CreateManualRecordRequest request, CurrentUserDto user, CancellationToken ct = default);
    Task ValidateManualAsync(Guid fileId, CreateManualRecordRequest request, CurrentUserDto user, CancellationToken ct = default);
    Task<RecordDeletedDto?> DeleteAsync(Guid recordId, CurrentUserDto user, CancellationToken ct = default);
    Task<SuggestionListDto?> GetSuggestionsAsync(Guid fileId, string? standardField, Guid? columnId, int take, CurrentUserDto user, CancellationToken ct = default);
}
