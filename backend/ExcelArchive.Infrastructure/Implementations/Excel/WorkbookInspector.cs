using ClosedXML.Excel;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Infrastructure.Implementations.Storage;
using FileIO = System.IO.File;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>ClosedXML inspection/reading: wizard previews, sidecar persistence, import materialization.</summary>
public sealed class WorkbookInspector(WorkbookFileStore store) : IWorkbookInspector, IWorkbookReader
{
    public async Task<IReadOnlyDictionary<string, object?>> InspectAsync(Stream stream, string fileName, CancellationToken ct = default)
    {
        var lower = fileName.ToLowerInvariant();
        if (!lower.EndsWith(".xlsx") && !lower.EndsWith(".xls"))
            throw new InvalidDataException("الصيغ المقبولة هي XLSX وXLS فقط.");
        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms, ct);
        var bytes = ms.ToArray();
        if (bytes.Length == 0) throw new InvalidDataException("الملف فارغ.");
        if (bytes.Length > 50 * 1024 * 1024) throw new InvalidDataException("حجم الملف يتجاوز الحد المسموح وهو 50 ميغابايت.");

        XLWorkbook workbook;
        try { workbook = SheetInspector.Load(bytes); }
        catch { throw new InvalidDataException("تعذر قراءة المصنف. إذا كان الملف بصيغة XLS القديمة فحوّله إلى XLSX ثم أعد المحاولة."); }
        using (workbook)
        {
            if (workbook.Worksheets.Count == 0) throw new InvalidDataException("لا يحتوي المصنف على أي أوراق قابلة للقراءة.");
            var token = await store.SaveAsync(fileName, bytes, ct);
            var sidecar = SheetInspector.ExtractSidecar(workbook);
            // Persist the filter-normalized copy so the worker sees unhidden rows.
            SheetInspector.RemoveFilters(workbook);
            await FileIO.WriteAllBytesAsync(store.PathFor(token), ToBytes(workbook), ct);
            await store.WriteSidecarAsync(token, sidecar, ct);
            var first = workbook.Worksheets.First();
            var table = sidecar.Tables.TryGetValue(first.Name, out var t) ? t : null;
            var selected = SheetInspector.InspectWorksheet(workbook, first, 1, table);
            return new Dictionary<string, object?>
            {
                ["token"] = token,
                ["originalFilename"] = fileName,
                ["sheets"] = workbook.Worksheets.Select(s => new { name = s.Name, rowCount = Math.Max(0, (s.LastRowUsed()?.RowNumber() ?? 1) - 1) }).ToList(),
                ["selected"] = selected,
            };
        }
    }

    public async Task<IReadOnlyDictionary<string, object?>> InspectSheetAsync(Guid token, string sheetName, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(sheetName)) throw new InvalidDataException("بيانات الورقة غير صالحة.");
        var bytes = await store.LoadAsync(token.ToString(), ct);
        using var workbook = SheetInspector.Load(bytes);
        var sheets = workbook.Worksheets.ToList();
        var index = sheets.FindIndex(s => s.Name == sheetName);
        if (index < 0) throw new InvalidDataException("الورقة المحددة غير موجودة في المصنف.");
        var sidecar = await store.ReadSidecarAsync(token.ToString(), ct);
        var ws = sheets[index];
        var table = FormatSidecarStore.TableRange(sidecar, ws.Name, index + 1);
        return ToSheetDictionary(token, SheetInspector.InspectWorksheet(workbook, ws, index + 1, table));
    }

    /// <summary>Real linked inspection: joined columns/preview/summary (P2.3 engine).</summary>
    public async Task<SheetInspection> InspectLinkedAsync(Guid token, LinkedSheetsConfig config, CancellationToken ct = default)
    {
        if (config.SheetNames.Count == 0
            || config.SheetNames.Distinct(StringComparer.Ordinal).Count() != config.SheetNames.Count
            || config.NationalIdColumnIndex < 1)
            throw new InvalidDataException("اختر الأوراق الإضافية وعمود الرقم الوطني في الورقة الأساسية.");
        var bytes = await store.LoadAsync(token.ToString(), ct);
        using var workbook = SheetInspector.Load(bytes);
        var sidecar = await store.ReadSidecarAsync(token.ToString(), ct);
        var (inspection, _) = LinkedSheetEngine.MergeLinkedSheets(workbook, config, sidecar?.Tables);
        return inspection;
    }

    public async Task<WorkbookImportData> ReadForImportAsync(byte[] bytes, string token, WorkbookImportSpec spec, CancellationToken ct = default)
    {
        using var workbook = SheetInspector.Load(bytes);
        var sheets = workbook.Worksheets.ToList();
        var ws = sheets.FirstOrDefault(w => w.Name == spec.SheetName)
            ?? (spec.SheetIndex >= 1 && spec.SheetIndex <= sheets.Count
                ? sheets[spec.SheetIndex - 1] : null)
            ?? throw new InvalidDataException("الورقة المحددة غير موجودة عند بدء الاستيراد.");
        var sidecar = await store.ReadSidecarAsync(token, ct);
        SheetTableRange? table = null;
        if (sidecar is not null)
            table = FormatSidecarStore.TableRange(sidecar, spec.SheetName, spec.SheetIndex);
        table ??= ExcelTableRange.ForSheet(ws);

        List<ImportRowDto> rows;
        if (spec.Linked is not null)
        {
            var tables = sidecar is null ? null
                : sidecar.Tables.ToDictionary(kv => kv.Key, kv => kv.Value);
            var (inspection, joined) = LinkedSheetEngine.MergeLinkedSheets(workbook, spec.Linked, tables);
            if (inspection.Columns.Count != spec.Columns.Count
                || inspection.Columns.Where((c, i) =>
                    c.ColumnIndex != spec.Columns[i].ColumnIndex
                    || c.HeaderRaw != spec.Columns[i].HeaderRaw
                    || c.HeaderNormalized != spec.Columns[i].HeaderNormalized).Any())
                throw new InvalidDataException("تغيرت إعدادات الأعمدة المجمّعة؛ أعد معاينة وربط الأوراق قبل الاستيراد.");
            rows = joined.Select(r => new ImportRowDto(r.RowIndex, r.Values, null)).ToList();
        }
        else
        {
            var width = table?.ColumnCount ?? spec.Columns.Max(c => c.ColumnIndex);
            var firstCol = table?.FirstCol ?? 1;
            var lastRow = table?.LastRow ?? ws.LastRowUsed()?.RowNumber() ?? 1;
            var firstDataRow = table?.FirstRow ?? 2;
            rows = [];
            for (var r = firstDataRow; r <= lastRow; r++)
            {
                ct.ThrowIfCancellationRequested();
                var row = ws.Row(r);
                var values = new List<string>(width);
                for (var i = 0; i < width; i++)
                    values.Add(ExcelCellReader.CellText(row.Cell(firstCol + i)));
                Dictionary<string, CellStyleDto>? styles = null;
                if (sidecar is not null)
                {
                    var formats = FormatSidecarStore.RowFormats(sidecar, spec.SheetName, spec.SheetIndex, r);
                    if (formats is not null)
                    {
                        styles = new Dictionary<string, CellStyleDto>(StringComparer.Ordinal);
                        foreach (var col in spec.Columns)
                        {
                            var key = (col.ColumnIndex - 1).ToString();
                            if (formats.Fills.TryGetValue(key, out var fill) || formats.Fonts.TryGetValue(key, out var font))
                                styles[col.HeaderRaw] = new CellStyleDto(
                                    formats.Fills.TryGetValue(key, out var f) ? f : null,
                                    formats.Fonts.TryGetValue(key, out var fo) ? fo : null);
                        }
                        if (styles.Count == 0) styles = null;
                    }
                }
                rows.Add(new ImportRowDto(r, values, styles));
            }
        }
        return new WorkbookImportData(ws.Name, rows);
    }

    public string BuildColumnSignature(IEnumerable<string> headers)
        => HeaderEngine.ColumnSignature(headers);

    private static byte[] ToBytes(XLWorkbook workbook)
    {
        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        return ms.ToArray();
    }

    private static IReadOnlyDictionary<string, object?> ToSheetDictionary(Guid token, SheetInspection inspection) =>
        new Dictionary<string, object?>
        {
            ["token"] = token,
            ["sheetName"] = inspection.SheetName,
            ["sheetIndex"] = inspection.SheetIndex,
            ["rowCount"] = inspection.RowCount,
            ["columnCount"] = inspection.ColumnCount,
            ["columns"] = inspection.Columns,
            ["preview"] = inspection.Preview,
        };
}
