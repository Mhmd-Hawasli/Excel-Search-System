using ExcelArchive.Api.DTOs.Auth;
using ExcelArchive.Api.DTOs.Conflicts;

namespace ExcelArchive.Api.Services.Abstractions;

public interface IConflictService
{
    Task<ConflictsResult> ListAsync(ConflictQueryRequest request, DataScopeDto scope, CancellationToken ct = default);
    Task IgnoreAsync(string rule, Guid recordId, CancellationToken ct = default);
    Task<byte[]> ExportAsync(ConflictQueryRequest request, DataScopeDto scope, CancellationToken ct = default);
}
