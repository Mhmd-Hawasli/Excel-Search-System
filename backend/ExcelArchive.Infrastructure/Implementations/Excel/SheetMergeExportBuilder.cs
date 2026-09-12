using ClosedXML.Excel;
using ExcelArchive.Domain.SheetMerge;
using ExcelArchive.Infrastructure.Implementations.Excel;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>
/// Sheet-merge workbook exporter (P5.3). Port of V1
/// lib/sheet-merge/exporter.ts onto ClosedXML: الدمج sheet plus one
/// غير مرتبط sheet per source sheet with unlinked rows (all rows, not
/// just the 300 preview). Source fills/fonts travel with their rows;
/// unlinked prefix columns stay unformatted.
/// </summary>
public static class SheetMergeExportBuilder
{
    private const int RowHeightPoints = 30;
    private const double MaxColumnWidth = 200.0 / 7;
    private const double MinColumnWidth = 10;
    private const string DateNumberFormat = "DD/MM/YYYY";
    private const string ReasonHeader = "سبب التعذر";
    private const string RowNumberHeader = "رقم الصف";
    private const string SheetNameHeader = "الصفحة";

    private static int DisplayLength(string text)
    {
        var length = 0.0;
        foreach (var ch in text) length += ch > 255 ? 1.6 : 1;
        return (int)Math.Ceiling(length);
    }

    private static string SafeSheetName(string name, HashSet<string> taken)
    {
        var candidate = System.Text.RegularExpressions.Regex.Replace(name, @"[\[\]:*?/\\]", "-").Trim();
        if (candidate.Length == 0) candidate = SheetMergeLimits.UnlinkedSheetPrefix;
        if (candidate.Length > 31) candidate = candidate[..31];
        var suffix = 2;
        var stem = candidate;
        while (!taken.Add(candidate.ToLowerInvariant()))
        {
            var tail = $" ({suffix})";
            candidate = stem[..Math.Min(stem.Length, 31 - tail.Length)] + tail;
            suffix++;
        }
        return candidate;
    }

    private static void ApplyColumnWidths(IXLWorksheet sheet, IReadOnlyList<string> headers, IReadOnlyList<IReadOnlyList<string>> rows)
    {
        for (var c = 0; c < headers.Count; c++)
        {
            var longest = DisplayLength(headers[c]);
            foreach (var row in rows)
            {
                if (c >= row.Count) continue;
                var text = row[c];
                if (text.Length == 0) continue;
                longest = Math.Max(longest, DisplayLength(text));
            }
            sheet.Column(c + 1).Width = Math.Min(MaxColumnWidth, Math.Max(MinColumnWidth, longest + 2));
        }
    }

    private static void StyleTableRange(IXLWorksheet sheet, int rowCount, int columnCount)
    {
        for (var r = 1; r <= rowCount + 1; r++)
        {
            sheet.Row(r).Height = RowHeightPoints;
            for (var c = 1; c <= columnCount; c++)
            {
                var cell = sheet.Row(r).Cell(c);
                cell.Style.Border.TopBorder = XLBorderStyleValues.Thin;
                cell.Style.Border.LeftBorder = XLBorderStyleValues.Thin;
                cell.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
                cell.Style.Border.RightBorder = XLBorderStyleValues.Thin;
            }
        }
        foreach (var col in sheet.Columns(1, columnCount))
        {
            col.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            col.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            col.Style.Alignment.WrapText = true;
        }
    }

    private static void ApplyRowFormats(IXLWorksheet sheet, int excelRow, SheetRowFormats? formats, int columnCount)
    {
        if (formats is null) return;
        var row = sheet.Row(excelRow);
        for (var i = 0; i < columnCount; i++)
        {
            var key = i.ToString();
            if (formats.Fills.TryGetValue(key, out var fill))
            {
                var cell = row.Cell(i + 1);
                cell.Style.Fill.PatternType = XLFillPatternValues.Solid;
                cell.Style.Fill.BackgroundColor = XLColor.FromHtml(fill);
            }
            if (formats.Fonts.TryGetValue(key, out var font))
                row.Cell(i + 1).Style.Font.FontColor = XLColor.FromHtml(font);
        }
    }

    private static void WriteTable(
        XLWorkbook workbook, HashSet<string> taken, int tableIndex,
        string sheetName, IReadOnlyList<string> headers,
        IReadOnlyList<IReadOnlyList<string>> stringRows,
        IReadOnlyList<SheetRowFormats?>? rowFormats)
    {
        var sheet = workbook.Worksheets.Add(SafeSheetName(sheetName, taken));
        var exportHeaders = FileExportBuilder.UniqueTableColumnNames(headers);
        // Write cells BEFORE CreateTable (see MergeExportBuilder): creating
        // over an empty header row auto-names fields Column1..N and later
        // header writes trigger a colliding RenameField.
        for (var i = 0; i < exportHeaders.Count; i++)
            sheet.Cell(1, i + 1).Value = FileExportBuilder.FitCellText(exportHeaders[i]);
        var dateCells = new List<(int Row, int Col)>();
        for (var r = 0; r < stringRows.Count; r++)
            for (var c = 0; c < exportHeaders.Count && c < stringRows[r].Count; c++)
            {
                var text = FileExportBuilder.FitCellText(stringRows[r][c]);
                var parsed = text.Length > 0 ? FileExportBuilder.ParseStoredDate(text) : null;
                var cell = sheet.Cell(r + 2, c + 1);
                if (parsed.HasValue)
                {
                    cell.Value = parsed.Value;
                    dateCells.Add((r, c));
                }
                else
                {
                    cell.Value = text;
                }
            }
        var table = sheet.Range(1, 1, stringRows.Count + 1, exportHeaders.Count).CreateTable($"SheetMergeTable{tableIndex}");
        table.Theme = XLTableTheme.TableStyleLight9;
        table.ShowRowStripes = false;
        table.ShowAutoFilter = true;
        var headerRow = sheet.Row(1);
        headerRow.Style.Font.Bold = true;
        headerRow.Style.Font.FontColor = XLColor.White;
        headerRow.Cell(1).Style.Fill.PatternType = XLFillPatternValues.Solid;
        headerRow.Cell(1).Style.Fill.BackgroundColor = XLColor.FromHtml("#1F4E78");
        foreach (var (row, col) in dateCells)
            sheet.Cell(row + 2, col + 1).Style.DateFormat.Format = DateNumberFormat;
        if (rowFormats is not null)
            for (var r = 0; r < stringRows.Count && r < rowFormats.Count; r++)
                ApplyRowFormats(sheet, r + 2, rowFormats[r], exportHeaders.Count);
        ApplyColumnWidths(sheet, exportHeaders, stringRows);
        StyleTableRange(sheet, stringRows.Count, exportHeaders.Count);
    }

    public static byte[] Build(
        SheetMergeEngine.Built built,
        Action<int, string?>? onProgress = null, CancellationToken ct = default)
    {
        onProgress?.Invoke(10, "تجهيز أعمدة الصفحات المدموجة…");
        using var workbook = new XLWorkbook();
        workbook.Properties.Author = "نظام أرشفة ملفات الإكسل";
        workbook.Properties.Created = DateTime.UtcNow;
        var taken = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        onProgress?.Invoke(25, $"كتابة صفحة «{SheetMergeLimits.MergedSheetName}»…");
        WriteTable(workbook, taken, 1, SheetMergeLimits.MergedSheetName,
            built.GridHeaders, built.GridRows, built.GridFormats);

        for (var i = 0; i < built.UnlinkedSheets.Count; i++)
        {
            ct.ThrowIfCancellationRequested();
            var (sheetName, headers, rows) = built.UnlinkedSheets[i];
            onProgress?.Invoke(30 + (int)Math.Round((i + 1) / (double)built.UnlinkedSheets.Count * 55),
                $"كتابة الصفوف غير المرتبطة في «{sheetName}»…");
            var shifted = rows.Select(row =>
            {
                if (row.Formats is null) return (SheetRowFormats?)null;
                static Dictionary<string, string> Shift(Dictionary<string, string> values)
                {
                    var result = new Dictionary<string, string>();
                    foreach (var kv in values)
                        if (int.TryParse(kv.Key, out var index))
                            result[(index + 3).ToString()] = kv.Value;
                    return result;
                }
                return (SheetRowFormats?)new SheetRowFormats(Shift(row.Formats.Fills), Shift(row.Formats.Fonts));
            }).ToList();
            WriteTable(workbook, taken, i + 2,
                $"{SheetMergeLimits.UnlinkedSheetPrefix} - {sheetName}",
                new[] { SheetNameHeader, RowNumberHeader, ReasonHeader }.Concat(headers).ToList(),
                rows.Select(row => (IReadOnlyList<string>)new[] { sheetName, row.RowNumber.ToString(), row.Reason }.Concat(row.Cells).ToList()).ToList(),
                shifted);
        }

        onProgress?.Invoke(90, "حفظ ملف Excel…");
        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        return OpenXmlRtl.ApplyRightToLeft(ms.ToArray(),
            workbook.Worksheets.Select(ws => ws.Name));
    }
}
