using ExcelArchive.Application.DTOs.UploadDto;

namespace ExcelArchive.Application.DTOs.UploadDto;

/// <summary>Column identity for an import read (header match against the job config).</summary>
public sealed record ImportColumnSpec(string HeaderRaw, string HeaderNormalized, int ColumnIndex);

/// <summary>What to read for an import: sheet selection, optional linked merge, expected columns.</summary>
public sealed record WorkbookImportSpec(
    string SheetName,
    int SheetIndex,
    LinkedSheetsConfig? Linked,
    IReadOnlyList<ImportColumnSpec> Columns);

/// <summary>One imported data row with header-keyed cell styles (fill/font or null).</summary>
public sealed record ImportRowDto(
    int RowIndex,
    IReadOnlyList<string> Values,
    IReadOnlyDictionary<string, CellStyleDto>? Styles);

public sealed record CellStyleDto(string? Fill, string? Font);

/// <summary>Fully materialized import read: worksheet used + data rows.</summary>
public sealed record WorkbookImportData(
    string WorksheetName,
    IReadOnlyList<ImportRowDto> Rows);
