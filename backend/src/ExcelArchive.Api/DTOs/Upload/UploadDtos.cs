using ExcelArchive.Api.Models.Enums;

namespace ExcelArchive.Api.DTOs.Upload;

public record UploadJobDto(Guid Id, Guid? FileId, string Status, int TotalRows, int ProcessedRows, string? ErrorMessage, DateTime? StartedAt, DateTime? FinishedAt);
public record CreateUploadJobRequest(Guid GroupId, string Name, string Description, string OriginalFilename, string SheetName,
    int TotalRows, string ColumnSignature, IReadOnlyList<UploadColumnDto> Columns, string Mode, bool LinkedSheets);
public record UploadColumnDto(Guid? ColumnId, string HeaderRaw, int ColumnIndex, string? StandardField, Guid? CategoryId, bool IsKeyColumn = false);
public record CreateUploadJobResponse(Guid JobId);
public record SaveTemplateRequest(string Name);
public record SaveTemplateResponse(bool Ok);
