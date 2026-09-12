using ClosedXML.Excel;
using ExcelArchive.Application.DTOs.MergeDto;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Domain.Text;
using ExcelArchive.Infrastructure.Implementations.Storage;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>ClosedXML reads for two-file merge (stateless; workbook is local per call).</summary>
public sealed class MergeWorkbookReader : IMergeExcelReader
{
    public MergeWorkbookData ReadWorkbook(byte[] content)
    {
        using var workbook = LoadForInspect(content);
        if (workbook.Worksheets.Count == 0)
            throw new InvalidDataException("لا يحتوي المصنف على أي أوراق قابلة للقراءة.");
        var briefs = workbook.Worksheets.Select(ws =>
        {
            var table = ExcelTableRange.ForSheet(ws);
            var last = table?.LastRow ?? ws.LastRowUsed()?.RowNumber() ?? 1;
            var first = table?.FirstRow ?? 2;
            return new MergeSheetBrief(ws.Name, Math.Max(0, last - first + 1));
        }).ToList();
        var firstWs = workbook.Worksheets.First();
        return new MergeWorkbookData(briefs, InspectWorksheet(workbook, firstWs.Name));
    }

    private static XLWorkbook LoadForInspect(byte[] content)
    {
        try
        {
            return SheetInspector.Load(content);
        }
        catch (InvalidDataException)
        {
            throw;
        }
        catch (Exception)
        {
            throw new InvalidDataException(
                "تعذر قراءة المصنف. إذا كان الملف بصيغة XLS القديمة فحوّله إلى XLSX ثم أعد المحاولة.");
        }
    }

    private static XLWorkbook LoadForSheet(byte[] content)
    {
        try
        {
            return SheetInspector.Load(content);
        }
        catch (InvalidDataException)
        {
            throw;
        }
        catch (Exception)
        {
            throw new InvalidDataException("تعذر قراءة المصنف. يرجى إعادة رفع الملف.");
        }
    }

    public MergeSheetData ReadSheet(byte[] content, string sheetName)
    {
        using var workbook = LoadForSheet(content);
        var ws = workbook.Worksheets.FirstOrDefault(w => w.Name == sheetName)
            ?? throw new InvalidDataException("الورقة المحددة غير موجودة في المصنف.");
        var table = ExcelTableRange.ForSheet(ws);
        var headers = HeaderEngine.HeadersForSheet(ws, table);
        var firstCol = table?.FirstCol ?? 1;
        var firstDataRow = table?.FirstRow ?? 2;
        var lastDataRow = table?.LastRow ?? ws.LastRowUsed()?.RowNumber() ?? 1;
        var rows = new List<MergeRowData>();
        for (var r = firstDataRow; r <= lastDataRow; r++)
        {
            var row = ws.Row(r);
            var cells = new List<string>(headers.Count);
            for (var i = 0; i < headers.Count; i++)
                cells.Add(ExcelCellReader.CellText(row.Cell(firstCol + i)));
            if (cells.All(c => ArabicNormalizer.NormalizeStored(c).Length == 0)) continue;
            rows.Add(new MergeRowData(r, cells));
        }
        return new MergeSheetData(ws.Name, headers, rows,
            Math.Max(0, lastDataRow - firstDataRow + 1), headers.Count);
    }

    public static MergeSelectedSheet InspectWorksheet(XLWorkbook workbook, string sheetName)
    {
        var ws = workbook.Worksheets.FirstOrDefault(w => w.Name == sheetName)
            ?? throw new InvalidDataException("الورقة المحددة غير موجودة في المصنف.");
        var table = ExcelTableRange.ForSheet(ws);
        var headers = HeaderEngine.HeadersForSheet(ws, table);
        var firstCol = table?.FirstCol ?? 1;
        var firstDataRow = table?.FirstRow ?? 2;
        var lastDataRow = table?.LastRow ?? ws.LastRowUsed()?.RowNumber() ?? 1;
        var finalRow = Math.Min(lastDataRow, firstDataRow + 5);
        var preview = new List<IReadOnlyList<string>>();
        for (var r = firstDataRow; r <= finalRow; r++)
        {
            var row = ws.Row(r);
            var values = new List<string>(headers.Count);
            for (var i = 0; i < headers.Count; i++)
                values.Add(ExcelCellReader.CellText(row.Cell(firstCol + i)));
            preview.Add(values);
        }
        return new MergeSelectedSheet(ws.Name, headers, preview,
            Math.Max(0, lastDataRow - firstDataRow + 1), headers.Count);
    }

    private static XLWorkbook LoadWorkbook(byte[] content)
    {
        try
        {
            return SheetInspector.Load(content);
        }
        catch (InvalidDataException)
        {
            throw;
        }
        catch (Exception)
        {
            throw new InvalidDataException(
                "تعذر قراءة المصنف. إذا كان الملف بصيغة XLS القديمة فحوّله إلى XLSX ثم أعد المحاولة.");
        }
    }
}
