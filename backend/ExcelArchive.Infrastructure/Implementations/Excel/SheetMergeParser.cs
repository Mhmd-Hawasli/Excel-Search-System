using ClosedXML.Excel;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Domain.SheetMerge;
using ExcelArchive.Domain.Text;
using ExcelArchive.Infrastructure.Implementations.Storage;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>ClosedXML parsing for sheet-merge upload (stateless; workbook is local per call).</summary>
public sealed class SheetMergeParser : ISheetMergeParser
{
    private const int PreviewRows = 6;
    private const int SampleRows = 40;

    public async Task<UploadedWorkbook> ParseAsync(
        byte[] content, string fileName,
        Action<int, string?>? onProgress = null, CancellationToken ct = default)
    {
        onProgress?.Invoke(20, "قراءة المصنف…");
        XLWorkbook workbook;
        try
        {
            workbook = new XLWorkbook(new MemoryStream(content, writable: false));
        }
        catch
        {
            throw new InvalidDataException(
                "تعذر قراءة المصنف. إذا كان الملف بصيغة XLS القديمة فحوّله إلى XLSX ثم أعد المحاولة.");
        }
        using (workbook)
        {
            if (workbook.Worksheets.Count < SheetMergeLimits.MinSheets)
                throw new InvalidDataException(
                    $"يجب أن يحتوي الملف على أكثر من صفحة واحدة ليتم الدمج — هذا الملف يحتوي على {workbook.Worksheets.Count} صفحة فقط.");

            await Task.Yield();
            onProgress?.Invoke(35, "التحقق من الصفوف والأعمدة المخفية وإظهارها…");
            var tables = workbook.Worksheets.ToDictionary(
                ws => ws.Name, ws => ExcelTableRange.ForSheet(ws), StringComparer.Ordinal);
            var filtersRemoved = ClearWorkbookFilters(workbook);

            var uploaded = new UploadedWorkbook { OriginalFilename = fileName };
            var index = 0;
            foreach (var ws in workbook.Worksheets)
            {
                ct.ThrowIfCancellationRequested();
                onProgress?.Invoke(40 + (int)Math.Round((index + 1) / (double)workbook.Worksheets.Count * 55),
                    $"قراءة الصفحة «{ws.Name}» ({index + 1} من {workbook.Worksheets.Count})…");
                var table = tables.TryGetValue(ws.Name, out var t) ? t : null;
                var headers = SheetHeaders(ws, table);
                uploaded.Sheets.Add(new UploadedSheet
                {
                    Name = ws.Name,
                    Hidden = IsHidden(ws),
                    Headers = headers,
                    Rows = SheetDataRows(ws, headers, table),
                    FiltersRemoved = filtersRemoved.TryGetValue(ws.Name, out var changed) && changed,
                });
                index++;
                await Task.Yield();
            }

            return uploaded;
        }
    }

    private static bool IsHidden(IXLWorksheet ws)
    {
        try { return ws.Visibility != XLWorksheetVisibility.Visible; }
        catch { return false; }
    }

    /// <summary>V1 clearWorkbookFilters: drop auto-filters/tables, unhide
    /// rows and columns. Bounds were captured beforehand; in-memory only.</summary>
    private static Dictionary<string, bool> ClearWorkbookFilters(XLWorkbook workbook)
    {
        var removed = new Dictionary<string, bool>(StringComparer.Ordinal);
        foreach (var ws in workbook.Worksheets)
        {
            var changed = false;
            try
            {
                if (ws.AutoFilter.IsEnabled) { ws.AutoFilter.Clear(); changed = true; }
            }
            catch { /* sheets without filters */ }
            // Table bounds were captured before normalization; the table
            // objects stay (reads use explicit bounds) but count as removed
            // filters like V1 (in-memory only, the stored bytes are untouched).
            try
            {
                if (ws.Tables.Any()) changed = true;
            }
            catch { /* keep going */ }
            try
            {
                foreach (var row in ws.RowsUsed())
                    if (row.IsHidden) { row.Unhide(); changed = true; }
                var lastCol = ws.LastColumnUsed()?.ColumnNumber() ?? 0;
                for (var c = 1; c <= lastCol; c++)
                    if (ws.Column(c).IsHidden) { ws.Column(c).Unhide(); changed = true; }
            }
            catch { /* keep going */ }
            removed[ws.Name] = changed;
        }
        return removed;
    }

    private static List<string> SheetHeaders(IXLWorksheet ws, SheetTableRange? table)
    {
        var headerRow = table?.HeaderRow ?? 1;
        var firstCol = table?.FirstCol ?? 1;
        var row = ws.Row(headerRow);
        var count = table?.ColumnCount ?? Math.Max(ws.LastColumnUsed()?.ColumnNumber() ?? 0, row.LastCellUsed()?.Address.ColumnNumber ?? 0);
        count = Math.Max(count, 1);
        var headers = new List<string>(count);
        for (var i = 0; i < count; i++)
        {
            var text = ExcelCellReader.CellText(row.Cell(firstCol + i)).Trim();
            headers.Add(text.Length == 0 ? $"عمود {i + 1}" : text);
        }
        return headers;
    }

    private static List<UploadedSheetRow> SheetDataRows(
        IXLWorksheet ws, List<string> headers, SheetTableRange? table)
    {
        var rows = new List<UploadedSheetRow>();
        var firstCol = table?.FirstCol ?? 1;
        var firstDataRow = table?.FirstRow ?? 2;
        var lastDataRow = table?.LastRow ?? ws.LastRowUsed()?.RowNumber() ?? 1;
        for (var r = firstDataRow; r <= lastDataRow; r++)
        {
            var row = ws.Row(r);
            var cells = new List<string>(headers.Count);
            for (var i = 0; i < headers.Count; i++)
                cells.Add(ExcelCellReader.CellText(row.Cell(firstCol + i)));
            if (cells.All(c => ArabicNormalizer.NormalizeStored(c).Length == 0)) continue;
            SheetRowFormats? formats = null;
            try
            {
                var extracted = ExcelStyleReader.ExtractRowFormats(row, headers.Count, firstCol);
                if (extracted.Fills.Count > 0 || extracted.Fonts.Count > 0)
                    formats = new SheetRowFormats(
                        new Dictionary<string, string>(extracted.Fills),
                        new Dictionary<string, string>(extracted.Fonts));
            }
            catch { /* colors are best-effort */ }
            rows.Add(new UploadedSheetRow { RowNumber = r, Cells = cells, Formats = formats });
        }
        return rows;
    }
}
