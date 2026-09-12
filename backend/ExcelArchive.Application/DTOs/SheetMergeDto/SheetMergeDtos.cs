using ExcelArchive.Domain.SheetMerge;

namespace ExcelArchive.Application.DTOs.SheetMergeDto;

public sealed record SheetMergeUploadResult(
    Guid UploadId, string OriginalFilename, int SheetCount,
    IReadOnlyList<SheetMergeUploadSheet> Sheets,
    SheetMergeUploadMain Main, NationalIdSuggestion Suggestion);

public sealed record SheetMergeUploadSheet(
    string Name, bool Hidden, int RowCount, int ColumnCount,
    string FirstColumnHeader, bool FiltersRemoved, bool Linkable, string? Reason);

public sealed record SheetMergeUploadMain(
    string Name, IReadOnlyList<string> Headers,
    IReadOnlyList<IReadOnlyList<string>> Preview, int RowCount);

public sealed record SheetMergeRunResult(
    Guid SessionId, string OriginalFilename, string MainSheetName,
    int NationalIdColumn, string NationalIdHeader,
    IReadOnlyList<string> ExportHeaders, int ExportRowCount,
    double LinkPercent, IReadOnlyList<SheetMergeSheetStat> Sheets);

public sealed record SheetMergeReadyResult(
    Guid DownloadId, string Filename, long Size, int SheetCount);
