using ExcelArchive.Domain.Enums;

namespace ExcelArchive.Application.DTOs.UploadDto;

public record UploadJobDto(Guid Id, Guid? FileId, string Status, int TotalRows, int ProcessedRows, string? ErrorMessage, DateTime? StartedAt, DateTime? FinishedAt);
public record CreateUploadJobRequest(Guid GroupId, string Name, string Description, string OriginalFilename, string SheetName,
    int SheetIndex, int TotalRows, IReadOnlyList<UploadColumnDto> Columns, string Mode = "single", string? ColumnSignature = null, LinkedSheetsConfig? LinkedSheets = null,
    Guid? Token = null);
public record UploadColumnDto(Guid? ColumnId, string HeaderRaw, string HeaderNormalized, int ColumnIndex, string? StandardField, Guid? CategoryId, bool IsKeyColumn = false);
public record CreateUploadJobResponse(Guid JobId);
public record SaveTemplateRequest(string Name);
public record SaveTemplateResponse(bool Ok);
