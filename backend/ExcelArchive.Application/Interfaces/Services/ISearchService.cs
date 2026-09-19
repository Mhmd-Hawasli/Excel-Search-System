using ExcelArchive.Application.DTOs.SearchDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface ISearchService
{
    Task<SearchResultSet> SearchAsync(SearchQuery query, CancellationToken ct = default);

    /// <summary>
    /// Top-N ranked rows of a single custom-field query (no paging/count,
    /// same exact+fuzzy branches as the single search): the bulk-search fast path.
    /// </summary>
    Task<IReadOnlyList<SearchResultRow>> SearchTopAsync(
        string field,
        string query,
        IReadOnlyList<Guid> groupIds,
        IReadOnlyList<Guid> fileIds,
        IReadOnlyList<Guid>? allowedFileIds,
        int take,
        CancellationToken ct = default);
}
