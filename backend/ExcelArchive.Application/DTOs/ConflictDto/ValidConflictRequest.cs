namespace ExcelArchive.Application.DTOs.ConflictDto;

/// <summary>
/// Validated conflicts list request mirroring V1 lib/conflicts/request.ts.
/// Defaults: category invalid, field all, rule all, page 1, pageSize 25,
/// sortBy issueNumber, sortDir asc. Any violation (unknown category/field/
/// rule, out-of-range page, or field/rule not belonging to the category)
/// yields the single V1 400 message.
/// </summary>
public record ValidConflictRequest(
    string Category,
    string Field,
    string Rule,
    int Page,
    int PageSize,
    string SortBy,
    string SortDir);
