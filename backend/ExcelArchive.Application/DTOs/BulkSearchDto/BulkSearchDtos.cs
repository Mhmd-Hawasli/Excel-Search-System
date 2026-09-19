namespace ExcelArchive.Application.DTOs.BulkSearchDto;

/// <summary>Bulk search (البحث الجماعي) data contracts. The uploaded workbook
/// is isolated in a short-lived temp store and never touches archive records;
/// the result workbook is built per request and streamed back directly.</summary>
public sealed record BulkSearchSheetBrief(string Name, int RowCount);

public sealed record BulkSearchSelectedSheet(
    string SheetName,
    IReadOnlyList<string> Headers,
    IReadOnlyList<IReadOnlyList<string>> Preview,
    int RowCount,
    int ColumnCount);

public sealed record BulkSearchInspection(
    Guid Token,
    string OriginalFilename,
    IReadOnlyList<BulkSearchSheetBrief> Sheets,
    BulkSearchSelectedSheet Selected);

public sealed record BulkSearchRunArgs(
    Guid Token,
    string SheetName,
    string Field,
    int ColumnIndex);

/// <summary>One exported match: the searched Excel value repeated per
/// high-match archive row (التسلسل groups rows of the same searched value).</summary>
public sealed record BulkSearchRow(
    int Sequence,
    string QueryValue,
    string Field,
    string GroupName,
    string FileName,
    int RowIndex,
    string? FullName,
    string? NationalId,
    string? ShamCash,
    string? PersonalNo,
    int MatchPercent);

public sealed record BulkSearchResult(
    string Field,
    int TotalValues,
    int MatchedValues,
    int UnmatchedValues,
    IReadOnlyList<BulkSearchUnmatched> UnmatchedQueries,
    IReadOnlyList<BulkSearchRow> Rows,
    int TotalMatches,
    bool Truncated);

/// <summary>A searched value with no high match: carried with its sequence so
/// the export can list every searched value in order, with empty match cells.</summary>
public sealed record BulkSearchUnmatched(
    int Sequence,
    string Query);

/// <summary>One result row sent back by the client for direct xlsx export:
/// export builds the workbook from these rows without re-running the search.</summary>
public sealed record BulkSearchExportRow(
    int Sequence,
    string QueryValue,
    string Field,
    string FileName,
    int RowIndex,
    string? FullName,
    string? NationalId,
    string? ShamCash,
    string? PersonalNo,
    int MatchPercent);

/// <summary>A searched value with no match, sent back for export: rendered as
/// a row with empty file/row/match cells.</summary>
public sealed record BulkSearchExportUnmatched(
    int Sequence,
    string QueryValue,
    string Field);

public sealed record BulkSearchExportRequest(
    List<BulkSearchExportRow>? Rows,
    List<BulkSearchExportUnmatched>? Unmatched = null);
