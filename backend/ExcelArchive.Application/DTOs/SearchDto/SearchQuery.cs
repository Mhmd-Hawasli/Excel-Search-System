namespace ExcelArchive.Application.DTOs.SearchDto;

/// <summary>Validated search input mirroring V1 lib/search/query.ts SearchRequest.</summary>
public record SearchQuery(
    string Query,
    string Mode,
    string? Field,
    IReadOnlyList<Guid> GroupIds,
    IReadOnlyList<Guid> FileIds,
    IReadOnlyList<Guid>? AllowedFileIds,
    int Page,
    int PageSize,
    string? SortBy,
    string SortDirection);
