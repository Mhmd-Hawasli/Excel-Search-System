using ExcelArchive.Api.DTOs.Auth;
using ExcelArchive.Api.DTOs.Common;

namespace ExcelArchive.Api.Services.Abstractions;

public interface ISearchService
{
    Task<PageResult<SearchResultDto>> SearchAsync(SearchRequest request, DataScopeDto scope, CancellationToken ct = default);
}

public record SearchRequest(string? Query, string? Mode, string? Field, IReadOnlyList<Guid>? GroupIds, IReadOnlyList<Guid>? FileIds, int Page = 1, int PageSize = 25);

public record SearchResultDto(Guid Id, Guid FileId, string FileName, Guid GroupId, string GroupName, int RowIndex,
    string? FullName, string? NationalId, string? Phone, IReadOnlyDictionary<string, object?> Data);
