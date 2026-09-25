using ExcelArchive.Application.DTOs.UploadDto;

namespace ExcelArchive.Application.DTOs.FileDto;

public record FileDto(
    Guid Id,
    Guid GroupId,
    string Name,
    string Description,
    string OriginalFilename,
    string SheetName,
    int RowCount,
    string ColumnSignature,
    int Version,
    DateTime UploadedAt,
    DateTime UpdatedAt,
    string? GroupName = null,
    int ColumnCount = 0);

public record CheckFileNameRequest(string Name);
public record CheckFileNameResponse(bool Available, string? Error = null);
public record FileColumnDto(Guid Id, string HeaderRaw, string HeaderNormalized, int ColumnIndex, string? StandardField, Guid? CategoryId, string? CategoryName = null);
public record FileMappingDto(Guid FileId, string Name, IReadOnlyList<FileColumnDto> Columns);

/// <summary>File detail read model (docs/05): identity + mapping + counters.</summary>
public record FileDetailDto(
    FileDto File,
    IReadOnlyList<FileColumnDto> Columns,
    int QualityIssueCount,
    long EditCount);

public record QualityIssueDto(int RowIndex, string IssueType, string? ColumnName, string? RawValue);
public record QualityTypeCount(string IssueType, long Count);

/// <summary>Stored quality report read model (docs/05: GET files/[id]/quality).</summary>
public record FileQualityDto(
    Guid FileId,
    string Name,
    int RowCount,
    IReadOnlyList<QualityTypeCount> Counts,
    IReadOnlyList<QualityIssueDto> Issues);
/// <summary>Remap request. PkColumnId designates the FileColumn that must act
/// as the pk key after the update (null = keep the current key). Changing the
/// key destroys every stored record of the file, so a pk change is applied
/// only when ConfirmPkChange is true (explicit user acknowledgment).</summary>
public record UpdateMappingRequest(
    IReadOnlyList<UpdateColumnMappingDto> Columns,
    Guid? PkColumnId = null,
    bool ConfirmPkChange = false);
public record UpdateColumnMappingDto(Guid Id, string? StandardField, Guid? CategoryId);
public record DeleteFileRequest(string ConfirmName);
public record MoveFileRequest(Guid TargetGroupId);
public record BumpVersionRequest(string? Note);

/// <summary>One version-history entry: WHAT changed in this version and who did it.</summary>
public record FileVersionDto(
    Guid Id,
    Guid FileId,
    int Version,
    string Note,
    string Kind,
    string? CreatedBy,
    DateTime CreatedAt,
    long EditCount,
    bool CanExport = true);

/// <summary>Full version state of a file: current number, pending (live) manual
/// edits on it, and the history newest-first.</summary>
public record FileVersionsResponse(
    Guid FileId,
    int CurrentVersion,
    int PendingEditCount,
    IReadOnlyList<FileVersionDto> Versions);

public record BumpVersionResponse(
    Guid FileId,
    int PreviousVersion,
    int NewVersion,
    int ArchivedEdits);
public record ReplaceColumnDto(string HeaderRaw, string HeaderNormalized, int ColumnIndex, string? StandardField, Guid? CategoryId);
public record ReplaceLinkedSheetsDto(IReadOnlyList<string> SheetNames, int NationalIdColumnIndex);
/// <summary>One cell the user chose to KEEP at its current (old) value instead
/// of taking the new workbook's value. Row identity mirrors the preview's
/// match mode: national-id key when matched by national id, else Excel row.
/// HeaderRaw is the system's (current) header name.</summary>
public record KeepOldCellDto(int RowIndex, string HeaderRaw, string? MatchKey);
public record ReplaceFileRequest(string OriginalFilename, string SheetName, int SheetIndex, int TotalRows, string? ColumnSignature, string Mode, IReadOnlyList<ReplaceColumnDto>? Columns, ReplaceLinkedSheetsDto? LinkedSheets, Guid? Token, IReadOnlyList<KeepOldCellDto>? KeepOldCells = null);
