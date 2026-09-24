using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IActivityLogRepository : IRepositoryBase<ActivityLog>
{
    /// <summary>
    /// Filtered, paged activity rows (newest first) with total count.
    /// Null action/search disables that filter; when the search term itself
    /// parses as an action, rows matching the name OR that action are kept
    /// (V1 semantics). Page/pageSize are pre-clamped by the caller (1..1000).
    /// </summary>
    Task<IReadOnlyList<ActivityLog>> ListByActionAsync(ActivityAction action, string targetName, CancellationToken ct = default);
    Task<(IReadOnlyList<ActivityLog> Rows, int Total)> SearchAsync(
        ActivityAction? action, string? search, ActivityAction? searchedAction,
        int page, int pageSize, CancellationToken ct = default);
    /// <summary>
    /// True when this visitor already logged a visit of this record since
    /// <paramref name="cutoff"/> (visit de-duplication: one audit row per
    /// visitor+record per window instead of one row per page view).
    /// </summary>
    Task<bool> ExistsRecentVisitAsync(Guid recordId, string visitorUsername, DateTime cutoff, CancellationToken ct = default);
}
