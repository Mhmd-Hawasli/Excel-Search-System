using ClosedXML.Excel;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>Workbook inspection ported from V1 workbook.ts onto ClosedXML:
/// durable bytes, format sidecar, filter normalization, table-aware bounds,
/// validated headers, suggestions and string-matrix previews.</summary>
public static class SheetInspector
{
    public static XLWorkbook Load(byte[] bytes) => new(new MemoryStream(bytes, writable: false));

    /// <summary>Captures formats + table ranges, then unhides filtered rows so
    /// every uploaded record is available (V1 removeWorkbookFilters).</summary>
    public static FormatSidecar ExtractSidecar(XLWorkbook workbook)
    {
        var order = new List<string>();
        var sheets = new Dictionary<string, Dictionary<string, RowFormats>>();
        var tables = new Dictionary<string, SheetTableRange?>();
        foreach (var ws in workbook.Worksheets)
        {
            order.Add(ws.Name);
            var table = ExcelTableRange.ForSheet(ws);
            tables[ws.Name] = table;
            var firstCol = table?.FirstCol ?? 1;
            var width = table?.ColumnCount ?? Math.Max(ws.LastColumnUsed()?.ColumnNumber() ?? 0, 1);
            var last = Math.Max(ws.LastRowUsed()?.RowNumber() ?? 0, 1);
            var rows = new Dictionary<string, RowFormats>();
            for (var r = 2; r <= last; r++)
            {
                var formats = ExcelStyleReader.ExtractRowFormats(ws.Row(r), width, firstCol);
                if (formats.Fills.Count > 0 || formats.Fonts.Count > 0)
                    rows[r.ToString()] = formats;
            }
            sheets[ws.Name] = rows;
        }
        return new FormatSidecar(1, order, sheets, tables);
    }

    public static void RemoveFilters(XLWorkbook workbook)
    {
        foreach (var ws in workbook.Worksheets)
        {
            var touched = false;
            try
            {
                if (ws.AutoFilter.IsEnabled)
                {
                    ws.AutoFilter.Clear();
                    touched = true;
                }
            }
            catch { /* sheets without filters */ }
            foreach (var rowNumber in ws.RowsUsed().Select(r => r.RowNumber()).Distinct().ToList())
            {
                var row = ws.Row(rowNumber);
                if (row.IsHidden) { row.Unhide(); touched = true; }
            }
            _ = touched;
        }
    }

    public static SheetInspection InspectWorksheet(
        XLWorkbook workbook, IXLWorksheet ws, int sheetIndex, SheetTableRange? table)
    {
        var headers = HeaderEngine.HeadersForSheet(ws, table);
        var firstDataRow = table?.FirstRow ?? 2;
        var lastDataRow = table?.LastRow ?? ws.LastRowUsed()?.RowNumber() ?? 1;
        var finalRow = Math.Min(lastDataRow, firstDataRow + 19);
        var preview = new List<IReadOnlyList<string>>();
        for (var r = firstDataRow; r <= finalRow; r++)
        {
            var row = ws.Row(r);
            var values = new List<string>(headers.Count);
            for (var i = 0; i < headers.Count; i++)
                values.Add(ExcelCellReader.CellText(row.Cell((table?.FirstCol ?? 1) + i)));
            preview.Add(values);
        }
        var columns = headers.Select((h, i) => new InspectedColumn(
            h, ArabicNormalizer.NormalizeStored(h), i + 1, HeaderEngine.SuggestStandardField(h))).ToList();
        return new SheetInspection(
            ws.Name, sheetIndex,
            Math.Max(0, lastDataRow - firstDataRow + 1),
            headers.Count, columns, preview);
    }

    public static WorkbookSheetSummary Summarize(IXLWorksheet ws) => new(
        ws.Name, Math.Max(0, (ws.LastRowUsed()?.RowNumber() ?? 1) - 1));
}
