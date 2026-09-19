using ExcelArchive.Application.DTOs.ExcelDto;
using ExcelArchive.Application.Interfaces.Excel;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>Adapter over the static ClosedXML export builder (no static state crosses layers).</summary>
public sealed class FileExportBuilderAdapter : IFileExportBuilder
{
    public byte[] Build(string sheetName, IReadOnlyList<string> headers, IReadOnlyList<ExportRecordDto> records, IReadOnlyList<ExportEditDto> edits, bool markEdits = false)
        => FileExportBuilder.Build(
            sheetName,
            headers,
            records.Select(r => new ExportRecord(r.Id, r.RowIndex, r.Data, r.Fills, r.Fonts, r.DisplayName, r.NationalId)).ToList(),
            edits.Select(e => new ExportEdit(e.RecordId, e.HeaderRaw, e.OldValue, e.NewValue, e.EditedBy, e.CreatedAt)).ToList(),
            markEdits);
}
