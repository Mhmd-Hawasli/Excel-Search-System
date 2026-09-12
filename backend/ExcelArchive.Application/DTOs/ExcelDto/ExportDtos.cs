namespace ExcelArchive.Application.DTOs.ExcelDto;

public sealed record ExportRecordDto(
    Guid Id, int RowIndex, Dictionary<string, string> Data,
    Dictionary<string, string>? Fills, Dictionary<string, string>? Fonts);

public sealed record ExportEditDto(string RecordId, string HeaderRaw, string OldValue);

public sealed record FileExportDataDto(
    string SheetName,
    string FileName,
    IReadOnlyList<string> Headers,
    IReadOnlyList<ExportRecordDto> Records,
    IReadOnlyList<ExportEditDto> Edits);
