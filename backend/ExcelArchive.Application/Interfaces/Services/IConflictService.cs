using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Common.Conflicts;
using ExcelArchive.Application.DTOs.ConflictDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface IConflictService
{
    Task<ConflictListResult> ListAsync(ValidConflictRequest request, DataScopeDto scope, CancellationToken ct = default);
    Task IgnoreAsync(string rule, Guid recordId, DataScopeDto scope, CancellationToken ct = default);
    Task<byte[]> ExportAsync(ValidConflictRequest request, DataScopeDto scope, CancellationToken ct = default);
    Task<ConflictStatsDto> StatsAsync(DataScopeDto scope, CancellationToken ct = default);
}