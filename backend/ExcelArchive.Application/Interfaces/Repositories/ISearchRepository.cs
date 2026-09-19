using ExcelArchive.Application.DTOs.SearchDto;

namespace ExcelArchive.Application.Interfaces.Repositories;

/// <summary>
/// Executes a logical search plan as parameterized SQL (count + page).
/// Scope is always applied inside the query; rows are never loaded wholesale.
/// </summary>
public interface ISearchRepository
{
    Task<SearchResultSet> ExecuteAsync(
        SearchPlan plan,
        IReadOnlyList<Guid> groupIds,
        IReadOnlyList<Guid> fileIds,
        IReadOnlyList<Guid>? allowedFileIds,
        string? sortBy,
        string sortDirection,
        int page,
        int pageSize,
        CancellationToken ct = default);

    /// <summary>
    /// Top-N rows of a plan as a single SELECT (no COUNT): for bulk flows
    /// that only need the first ranked matches of one query.
    /// </summary>
    Task<IReadOnlyList<SearchResultRow>> ExecuteTopAsync(
        SearchPlan plan,
        IReadOnlyList<Guid> groupIds,
        IReadOnlyList<Guid> fileIds,
        IReadOnlyList<Guid>? allowedFileIds,
        int take,
        CancellationToken ct = default);
}
