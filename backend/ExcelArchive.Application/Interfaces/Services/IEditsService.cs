using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.EditDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface IEditsService
{
    Task<IReadOnlyList<EditedFileSummary>> SummaryAsync(DataScopeDto scope, CancellationToken ct = default);
    Task<EditsResult> ListAsync(Guid? fileId, DataScopeDto scope, int page, int pageSize, CancellationToken ct = default);
    Task<RecordEditsResult> GetRecordEditsAsync(Guid recordId, CancellationToken ct = default);
    Task<EditResult> SaveAsync(Guid recordId, Guid? fileColumnId, string? headerRaw, string newValue, string actorUsername, DataScopeDto scope, CancellationToken ct = default);
    /// <summary>Server-derived revert: restores the previous effective value from
    /// history (V1 revertRecordEdit). Never trusts a caller-provided old value.</summary>
    Task<EditResult> RevertAsync(Guid recordId, Guid? fileColumnId, string? headerRaw, string actorUsername, DataScopeDto scope, CancellationToken ct = default);
    Task VisitAsync(Guid recordId, CurrentUserDto user, DataScopeDto scope, CancellationToken ct = default);
}
