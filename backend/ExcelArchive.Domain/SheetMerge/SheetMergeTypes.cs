namespace ExcelArchive.Domain.SheetMerge;

/// <summary>
/// Sheet-merge contracts ported from V1 lib/sheet-merge/types.ts.
/// Separate memory-only tool: never touches the archive DB or tmp files.
/// </summary>
public static class SheetMergeLimits
{
    public const int MinSheets = 2;
    public const int MinNationalIdDigits = 8;
    public const int UnlinkedPreviewLimit = 300;
    public const string MergedSheetName = "الدمج";
    public const string UnlinkedSheetPrefix = "غير مرتبط";
    public const string ExportBasename = "دمج-الصفحات";
}

/// <summary>Source colors of one row: fills/fonts by 0-based column index.</summary>
public sealed record SheetRowFormats(
    Dictionary<string, string> Fills, Dictionary<string, string> Fonts);

public sealed class UploadedSheetRow
{
    public int RowNumber { get; set; }
    public List<string> Cells { get; set; } = [];
    public SheetRowFormats? Formats { get; set; }
}

public sealed class UploadedSheet
{
    public string Name { get; set; } = "";
    public bool Hidden { get; set; }
    public List<string> Headers { get; set; } = [];
    public List<UploadedSheetRow> Rows { get; set; } = [];
    public bool FiltersRemoved { get; set; }
}

public sealed class UploadedWorkbook
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string OriginalFilename { get; set; } = "";
    public List<UploadedSheet> Sheets { get; set; } = [];
}

public sealed record NationalIdSuggestion(int? Index, string? Reason);

public sealed record UploadSheetSummary(
    string Name, bool Hidden, int RowCount, int ColumnCount,
    string FirstColumnHeader, bool FiltersRemoved, bool Linkable, string? Reason);

public sealed record UploadMainPreview(
    string Name, IReadOnlyList<string> Headers,
    IReadOnlyList<IReadOnlyList<string>> Preview, int RowCount);

public sealed record UploadInspection(
    Guid UploadId, string OriginalFilename, int SheetCount,
    IReadOnlyList<UploadSheetSummary> Sheets, UploadMainPreview Main,
    NationalIdSuggestion Suggestion);

public sealed record UnlinkedRow(
    int RowNumber, string Value, string Reason,
    IReadOnlyList<string> Cells, SheetRowFormats? Formats);

public sealed record SheetMergeSheetStat(
    string SheetName, string Role,
    IReadOnlyList<string> Headers, IReadOnlyList<string> UnlinkedHeaders,
    int RowCount, int LinkedCount, double Percent,
    int ValidKeyCount, int InvalidCount, int DuplicateCount, int MissingCount,
    int UnlinkedTotal, IReadOnlyList<UnlinkedRow> Unlinked);

public sealed record SheetMergeStats(
    string OriginalFilename, string MainSheetName,
    int NationalIdColumn, string NationalIdHeader,
    IReadOnlyList<string> ExportHeaders, int ExportRowCount,
    double LinkPercent, IReadOnlyList<SheetMergeSheetStat> Sheets);

public sealed record SheetMergeResult(
    Guid SessionId, SheetMergeStats Stats,
    IReadOnlyList<string> GridHeaders, IReadOnlyList<IReadOnlyList<string>> GridRows);
