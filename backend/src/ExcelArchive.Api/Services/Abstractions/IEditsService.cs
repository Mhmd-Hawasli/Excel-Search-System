using ExcelArchive.Api.DTOs.Auth;
using ExcelArchive.Api.DTOs.Edits;

namespace ExcelArchive.Api.Services.Abstractions;

public interface IEditsService
{
    Task<IReadOnlyList<EditedFileSummary>> SummaryAsync(DataScopeDto scope, CancellationToken ct = default);
    Task<EditsResult> ListAsync(Guid? fileId, DataScopeDto scope, int page, int pageSize, CancellationToken ct = default);
    Task RevertAsync(Guid editId, string newValue, string actorUsername, CancellationToken ct = default);
    Task VisitAsync(Guid recordId, string actorUsername, CancellationToken ct = default);
}
