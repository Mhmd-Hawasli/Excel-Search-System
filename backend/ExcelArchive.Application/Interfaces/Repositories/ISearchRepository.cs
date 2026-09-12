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
}
