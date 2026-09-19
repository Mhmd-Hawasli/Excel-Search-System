namespace ExcelArchive.Application.DTOs.RecordDto;

/// <summary>Manual single-record insert (docs: إدخال سجل جديد).
/// Values are keyed by FileColumn Id (string form) to avoid header ambiguity;
/// headerRaw keys are also accepted as a fallback for forward-compat.</summary>
public record CreateManualRecordRequest(Dictionary<string, string>? Values);

public record ManualRecordTemplateColumnDto(
    Guid Id,
    string HeaderRaw,
    string? StandardField,
    Guid? CategoryId,
    string? CategoryName,
    int? CategoryOrder,
    int ColumnIndex);

public record ManualRecordTemplateDto(
    Guid FileId,
    string FileName,
    Guid GroupId,
    string GroupName,
    IReadOnlyList<ManualRecordTemplateColumnDto> Columns);

public record ManualRecordCreatedDto(Guid Id, Guid FileId, int RowIndex);

public record RecordDeletedDto(Guid FileId, int RowIndex);

public record SuggestionListDto(
    Guid FileId,
    string? StandardField,
    Guid? ColumnId,
    string HeaderRaw,
    IReadOnlyList<string> Values);
