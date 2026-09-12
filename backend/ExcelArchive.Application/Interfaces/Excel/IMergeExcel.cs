using ExcelArchive.Application.DTOs.MergeDto;
using ExcelArchive.Domain.Merge;
using ExcelArchive.Domain.SheetMerge;

namespace ExcelArchive.Application.Interfaces.Excel;

/// <summary>ClosedXML reads for two-file merge (stateless; workbook is local per call).</summary>
public interface IMergeExcelReader
{
    MergeWorkbookData ReadWorkbook(byte[] content);
    MergeSheetData ReadSheet(byte[] content, string sheetName);
}

/// <summary>ClosedXML reads for sheet-merge upload parsing.</summary>
public interface ISheetMergeParser
{
    Task<UploadedWorkbook> ParseAsync(
        byte[] content, string fileName,
        Action<int, string?>? onProgress = null, CancellationToken ct = default);
}

public interface IMergeExportBuilder
{
    byte[] Build(
        IReadOnlyList<string> leftHeaders, IReadOnlyList<MergeRow> left,
        IReadOnlyList<string> rightHeaders, IReadOnlyList<MergeRow> right,
        string scope = "confirmed", Action<int, string?>? onProgress = null);
    string FileName(string scope, DateTime? today = null);
}

public interface ISheetMergeExportBuilder
{
    byte[] Build(
        SheetMergeEngine.Built built,
        Action<int, string?>? onProgress = null, CancellationToken ct = default);
}
