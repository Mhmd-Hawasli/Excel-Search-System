using ExcelArchive.Api.DTOs.Upload;

namespace ExcelArchive.Api.DTOs.Files;

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
public record UpdateMappingRequest(IReadOnlyList<UpdateColumnMappingDto> Columns);
public record UpdateColumnMappingDto(Guid Id, string? StandardField, Guid? CategoryId);
public record DeleteFileRequest(string ConfirmName);
public record ReplaceFileRequest(Guid GroupId, string Name, string Description, string OriginalFilename, string SheetName, int TotalRows, string ColumnSignature, string Mode, IReadOnlyList<UploadColumnDto>? Columns = null);
