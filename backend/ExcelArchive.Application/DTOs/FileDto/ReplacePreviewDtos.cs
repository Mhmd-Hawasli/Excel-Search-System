namespace ExcelArchive.Application.DTOs.FileDto;

/// <summary>Cell-level replace preview: what would change if the new workbook
/// replaced the current file, with manual-edit (internal edit) distinction.
/// Designed to stay fast: summary + per-column stats + capped samples.</summary>
public record ReplacePreviewColumnStat(
    string HeaderRaw,
    int ColumnIndex,
    long ChangedCells,
    long ManualOverwriteCells);

/// <summary>A column present in the new workbook but not in the system:
/// it will be added by the update, with this many non-empty values.</summary>
public record ReplacePreviewNewColumn(
    string HeaderRaw,
    int ColumnIndex,
    long FilledValues);

public record ReplacePreviewChange(
    int RowIndex,
    string HeaderRaw,
    int ColumnIndex,
    string CurrentValue,
    string NewValue,
    bool WasManuallyEdited,
    string? EditedBy,
    DateTime? EditedAt,
    string? MatchKey);

public record ReplacePreviewSummary(
    int TotalRowsCurrent,
    int TotalRowsNew,
    int MatchedRows,
    int AddedRows,
    int RemovedRows,
    long TotalCellsCompared,
    long ChangedCells,
    int ChangedRows,
    int UnchangedRows,
    int ManualOverwriteCount,
    string MatchMode,
    bool HasMoreChanges);

public record ReplacePreviewResponse(
    bool Identical,
    IReadOnlyList<string> AddedColumns,
    IReadOnlyList<string> RemovedColumns,
    ReplacePreviewSummary? Summary,
    IReadOnlyList<ReplacePreviewColumnStat>? ColumnStats,
    IReadOnlyList<ReplacePreviewChange>? Changes,
    IReadOnlyList<int>? AddedRowSample,
    IReadOnlyList<int>? RemovedRowSample,
    bool Truncated,
    string? MatchMode,
    string? NationalIdHeader,
    int CurrentVersion,
    IReadOnlyList<ReplacePreviewNewColumn>? NewColumns = null,
    // Version rule visibility: live (pending) manual edits on the current
    // version take their own separate version at update time, so the update
    // lands on N+2 instead of N+1.
    int PendingEditCount = 0,
    int NextVersion = 0);
