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
public record UpdateMappingRequest(IReadOnlyList<UpdateColumnMappingDto> Columns);
public record UpdateColumnMappingDto(Guid Id, string? StandardField, Guid? CategoryId);
public record DeleteFileRequest(string ConfirmName);
public record ReplaceColumnDto(string HeaderRaw, string HeaderNormalized, int ColumnIndex, string? StandardField, Guid? CategoryId);
public record ReplaceLinkedSheetsDto(IReadOnlyList<string> SheetNames, int NationalIdColumnIndex);
public record ReplaceFileRequest(string OriginalFilename, string SheetName, int SheetIndex, int TotalRows, string? ColumnSignature, string Mode, IReadOnlyList<ReplaceColumnDto>? Columns, ReplaceLinkedSheetsDto? LinkedSheets, Guid? Token);
