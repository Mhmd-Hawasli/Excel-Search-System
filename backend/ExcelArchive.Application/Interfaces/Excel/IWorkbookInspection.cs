using ExcelArchive.Application.DTOs.UploadDto;

namespace ExcelArchive.Application.Interfaces.Excel;

/// <summary>ClosedXML workbook reading behind DTOs (no workbook leaks). Stateless.</summary>
public interface IWorkbookReader
{
    Task<WorkbookImportData> ReadForImportAsync(byte[] bytes, string token, WorkbookImportSpec spec, CancellationToken ct = default);
    string BuildColumnSignature(IEnumerable<string> headers);
}

/// <summary>Inspection flows (upload wizard): preview + sidecar persistence. Stateless.</summary>
public interface IWorkbookInspector
{
    Task<IReadOnlyDictionary<string, object?>> InspectAsync(Stream stream, string fileName, CancellationToken ct = default);
    Task<IReadOnlyDictionary<string, object?>> InspectSheetAsync(Guid token, string sheetName, CancellationToken ct = default);
    Task<SheetInspection> InspectLinkedAsync(Guid token, LinkedSheetsConfig config, CancellationToken ct = default);
}
