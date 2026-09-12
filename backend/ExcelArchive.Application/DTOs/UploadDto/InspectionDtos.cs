namespace ExcelArchive.Application.DTOs.UploadDto;

/// <summary>Inspection contracts mirroring V1 lib/excel/types.ts (camelCase JSON).</summary>
public record InspectedColumn(
    string HeaderRaw,
    string HeaderNormalized,
    int ColumnIndex,
    string? SuggestedField,
    string? SourceSheetName = null);

public record LinkedSheetsConfig(IReadOnlyList<string> SheetNames, int NationalIdColumnIndex);

public record LinkedSheetSummary(string SheetName, int MatchedRows, int MissingRows);

public record SheetInspection(
    string SheetName,
    int SheetIndex,
    int RowCount,
    int ColumnCount,
    IReadOnlyList<InspectedColumn> Columns,
    IReadOnlyList<IReadOnlyList<string>> Preview,
    LinkedSheetsConfig? LinkedSheets = null,
    IReadOnlyList<LinkedSheetSummary>? LinkedSummary = null);

public record WorkbookSheetSummary(string Name, int RowCount);

public record WorkbookInspection(
    string Token,
    string OriginalFilename,
    IReadOnlyList<WorkbookSheetSummary> Sheets,
    SheetInspection Selected);
