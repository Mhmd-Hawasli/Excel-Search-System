using ExcelArchive.Application.DTOs.ExcelDto;

namespace ExcelArchive.Application.Interfaces.Excel;

/// <summary>Builds the downloadable XLSX for a file export. Transient, stateless.</summary>
public interface IFileExportBuilder
{
    byte[] Build(string sheetName, IReadOnlyList<string> headers, IReadOnlyList<ExportRecordDto> records, IReadOnlyList<ExportEditDto> edits);
}
