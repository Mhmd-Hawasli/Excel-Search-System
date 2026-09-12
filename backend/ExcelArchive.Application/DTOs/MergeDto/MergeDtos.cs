using ExcelArchive.Domain.Merge;

namespace ExcelArchive.Application.DTOs.MergeDto;

public sealed record MergeSheetBrief(string Name, int RowCount);
public sealed record MergeSelectedSheet(
    string SheetName, IReadOnlyList<string> Headers,
    IReadOnlyList<IReadOnlyList<string>> Preview, int RowCount, int ColumnCount);
public sealed record MergeInspection(
    Guid Token, string OriginalFilename,
    IReadOnlyList<MergeSheetBrief> Sheets, MergeSelectedSheet Selected,
    IReadOnlyDictionary<string, int> SuggestedMapping);
public sealed record MergeRunArgs(
    Guid LeftToken, string LeftSheet, IReadOnlyDictionary<string, int> LeftMapping,
    Guid RightToken, string RightSheet, IReadOnlyDictionary<string, int> RightMapping,
    bool IgnoreConfirmation);
public sealed record MergeRunResult(
    Guid SessionId, IReadOnlyList<string> LeftHeaders, IReadOnlyList<string> RightHeaders,
    bool IgnoreConfirmation, MergeResult Result);
public sealed record MergeExportReadyResult(Guid DownloadId, string Filename, long Size);

/// <summary>ClosedXML-free workbook read for merge flows.</summary>
public sealed record MergeSheetData(
    string SheetName, IReadOnlyList<string> Headers, IReadOnlyList<MergeRowData> Rows,
    int TotalRows, int ColumnCount);
public sealed record MergeRowData(int RowNumber, IReadOnlyList<string> Cells);
public sealed record MergeWorkbookData(
    IReadOnlyList<MergeSheetBrief> Sheets, MergeSelectedSheet Selected);
