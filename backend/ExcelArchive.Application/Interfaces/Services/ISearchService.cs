using ExcelArchive.Application.DTOs.SearchDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface ISearchService
{
    Task<SearchResultSet> SearchAsync(SearchQuery query, CancellationToken ct = default);
}
