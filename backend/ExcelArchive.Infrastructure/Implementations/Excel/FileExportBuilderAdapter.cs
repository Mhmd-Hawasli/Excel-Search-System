using ExcelArchive.Application.DTOs.ExcelDto;
using ExcelArchive.Application.Interfaces.Excel;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>Adapter over the static ClosedXML export builder (no static state crosses layers).</summary>
public sealed class FileExportBuilderAdapter : IFileExportBuilder
{
    public byte[] Build(string sheetName, IReadOnlyList<string> headers, IReadOnlyList<ExportRecordDto> records, IReadOnlyList<ExportEditDto> edits)
        => FileExportBuilder.Build(
            sheetName,
            headers,
            records.Select(r => new ExportRecord(r.Id, r.RowIndex, r.Data, r.Fills, r.Fonts)).ToList(),
            edits.Select(e => new ExportEdit(e.RecordId, e.HeaderRaw, e.OldValue)).ToList());
}
