using ClosedXML.Excel;
using ExcelArchive.Domain.Merge;
using ExcelArchive.Infrastructure.Implementations.Excel;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>
/// Two-file merge workbook exporter (P5.2). Port of V1 lib/merge/exporter.ts
/// onto ClosedXML. Three sheets (الدمج الكامل, الجدول A, الجدول B), two
/// scopes (confirmed/all). Source fills/fonts are deliberately ignored —
/// only structural styling (table theme, header, borders, widths, row
/// heights) is applied. First sheet is a strict inner join: only pairs with
/// the same link key in both tables, ordered by key. Table A/B sheets keep
/// their scope filter unchanged. No row truncation.
/// </summary>
public static class MergeExportBuilder
{
    private const int RowHeightPoints = 30;
    private const double MaxColumnWidth = 200.0 / 7;
    private const double MinColumnWidth = 10;
    private const string DateNumberFormat = "DD/MM/YYYY";

    private static int DisplayLength(string text)
    {
        var length = 0.0;
        foreach (var ch in text) length += ch > 255 ? 1.6 : 1;
        return (int)Math.Ceiling(length);
    }

    private static List<string> PrefixedHeaders(string prefix, IReadOnlyList<string> headers)
    {
        var result = new List<string>(headers.Count);
        for (var i = 0; i < headers.Count; i++)
        {
            var h = headers[i]?.Trim() ?? "";
            result.Add($"{prefix}_{(h == "" ? $"عمود {i + 1}" : h)}");
        }
        return result;
    }

    private static string ConfirmText(MergeRow row)
        => row.Key is not null && row.Confirmed
            ? MergeExportNames.ConfirmedText : MergeExportNames.UnconfirmedText;

    private static bool IsConfirmedLink(MergeRow row)
        => row.Key is not null && row.Confirmed;

    private static List<List<string>> SortByLinkKey(List<List<string>> rows)
    {
        var linked = rows.Where(r => r[0] != "").OrderBy(r => r[0], StringComparer.Ordinal).ToList();
        var unlinked = rows.Where(r => r[0] == "").ToList();
        linked.AddRange(unlinked);
        return linked;
    }

    private sealed record Grid(IReadOnlyList<string> Headers, List<List<string>> Rows);

    private static Grid FullMergeGrid(
        IReadOnlyList<string> leftHeaders, IReadOnlyList<MergeRow> left,
        IReadOnlyList<string> rightHeaders, IReadOnlyList<MergeRow> right,
        string scope)
    {
        var headers = scope == "all"
            ? new[] { MergeExportNames.KeyHeader, MergeExportNames.ConfirmHeader }
                .Concat(PrefixedHeaders("A", leftHeaders)).Concat(PrefixedHeaders("B", rightHeaders)).ToList()
            : new[] { MergeExportNames.KeyHeader }
                .Concat(PrefixedHeaders("A", leftHeaders)).Concat(PrefixedHeaders("B", rightHeaders)).ToList();
        List<string> Prefix(MergeRow row) => scope == "all"
            ? [row.Key ?? "", ConfirmText(row)] : [row.Key ?? ""];
        bool Eligible(MergeRow row) => scope == "all" ? row.Key is not null : IsConfirmedLink(row);

        var rightByKey = new Dictionary<string, MergeRow>(StringComparer.Ordinal);
        foreach (var row in right)
            if (Eligible(row) && row.Key is not null && !rightByKey.ContainsKey(row.Key))
                rightByKey[row.Key] = row;
        var grid = new List<List<string>>();
        // Inner join: فقط الأزواج التي لها نفس مفتاح الربط في الجدولين معاً.
        // الصفوف التي لها مفتاح بطرف واحد فقط أو بلا مفتاح لا تظهر في صفحة الدمج.
        foreach (var row in left.Where(Eligible).OrderBy(r => r.Key!, StringComparer.Ordinal))
        {
            if (row.Key is null) continue;
            if (!rightByKey.TryGetValue(row.Key, out var partner) || partner is null) continue;
            grid.Add([.. Prefix(row), .. row.Cells, .. partner.Cells]);
        }
        return new Grid(headers, SortByLinkKey(grid));
    }

    private static Grid SingleTableGrid(
        IReadOnlyList<string> headers, IReadOnlyList<MergeRow> rows, string scope)
    {
        // الجدول A/B يعرض دائماً العدد الأعظمي: كل السطور (المطابقة + غير المطابقة).
        // الفرق بين النطاقين هو عمود التأكد فقط، وليس تصفية الصفوف.
        var gridHeaders = scope == "all"
            ? new[] { MergeExportNames.KeyHeader, MergeExportNames.ConfirmHeader }.Concat(headers).ToList()
            : new[] { MergeExportNames.KeyHeader }.Concat(headers).ToList();
        var grid = rows.Select(row => scope == "all"
            ? new List<string>([row.Key ?? "", ConfirmText(row), .. row.Cells])
            : new List<string>([row.Key ?? "", .. row.Cells])).ToList();
        return new Grid(gridHeaders, SortByLinkKey(grid));
    }

    private static void WriteTable(XLWorkbook workbook, string sheetName, Grid grid)
    {
        var sheet = workbook.Worksheets.Add(sheetName);
        var exportHeaders = FileExportBuilder.UniqueTableColumnNames(grid.Headers);
        // Write header + data cells BEFORE CreateTable: creating a table over
        // an empty header row makes ClosedXML auto-name fields Column1..N,
        // and writing headers afterwards triggers RenameField, which throws
        // ("same key already added") when a real header matches the ColumnN
        // pattern of a not-yet-renamed column (production 500 on /merge/export).
        for (var i = 0; i < exportHeaders.Count; i++)
            sheet.Cell(1, i + 1).Value = FileExportBuilder.FitCellText(exportHeaders[i]);
        var dateCells = new List<(int Row, int Col)>();
        for (var r = 0; r < grid.Rows.Count; r++)
            for (var c = 0; c < exportHeaders.Count && c < grid.Rows[r].Count; c++)
            {
                var text = FileExportBuilder.FitCellText(grid.Rows[r][c]);
                var parsed = text.Length > 0 ? FileExportBuilder.ParseStoredDate(text) : null;
                var cell = sheet.Cell(r + 2, c + 1);
                if (parsed.HasValue)
                {
                    try
                    {
                        cell.Value = parsed.Value;
                        dateCells.Add((r, c));
                    }
                    catch (OverflowException)
                    {
                        // تاريخ خارج نطاق Excel (قبل 1900): يُحفظ كنص.
                        cell.Value = text;
                    }
                }
                else
                {
                    cell.Value = text;
                }
            }
        var table = sheet.Range(1, 1, grid.Rows.Count + 1, exportHeaders.Count).CreateTable($"MergeTable{workbook.Worksheets.Count}");
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
        // عرض الأعمدة: نفس الحساب السابق لكن بدون تغيير بصري.
        for (var c = 0; c < exportHeaders.Count; c++)
        {
            var longest = DisplayLength(exportHeaders[c]);
            foreach (var row in grid.Rows)
            {
                if (c >= row.Count) continue;
                var text = row[c];
                if (text.Length == 0) continue;
                longest = Math.Max(longest, DisplayLength(text));
                if (longest + 2 >= MaxColumnWidth) break;
            }
            sheet.Column(c + 1).Width = Math.Min(MaxColumnWidth, Math.Max(MinColumnWidth, longest + 2));
        }
        // تنسيق النطاق دفعة واحدة بدل تنسيق كل خلية على حدة:
        // مع آلاف الصفوف كان التنسيق الخلوي يسبب بطئاً حاداً وفشل التصدير.
        var fullRange = sheet.Range(1, 1, grid.Rows.Count + 1, exportHeaders.Count);
        fullRange.Style.Border.TopBorder = XLBorderStyleValues.Thin;
        fullRange.Style.Border.LeftBorder = XLBorderStyleValues.Thin;
        fullRange.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
        fullRange.Style.Border.RightBorder = XLBorderStyleValues.Thin;
        fullRange.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        fullRange.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        fullRange.Style.Alignment.WrapText = true;
        for (var rowIndex = 1; rowIndex <= grid.Rows.Count + 1; rowIndex++)
            sheet.Row(rowIndex).Height = RowHeightPoints;
    }

    public static byte[] Build(
        IReadOnlyList<string> leftHeaders, IReadOnlyList<MergeRow> left,
        IReadOnlyList<string> rightHeaders, IReadOnlyList<MergeRow> right,
        string scope = "confirmed", Action<int, string?>? onProgress = null)
    {
        if (scope != "confirmed" && scope != "all")
            throw new InvalidDataException("نوع التصدير غير صالح.");
        using var workbook = new XLWorkbook();
        workbook.Properties.Author = "نظام أرشفة ملفات الإكسل";
        workbook.Properties.Created = DateTime.UtcNow;
        onProgress?.Invoke(5, "تجهيز شبكة الدمج الكامل…");
        WriteTable(workbook, MergeExportNames.SheetNames[0],
            FullMergeGrid(leftHeaders, left, rightHeaders, right, scope));
        onProgress?.Invoke(40, "كتابة الجدول الأول…");
        WriteTable(workbook, MergeExportNames.SheetNames[1],
            SingleTableGrid(leftHeaders, left, scope));
        onProgress?.Invoke(70, "كتابة الجدول الثاني…");
        WriteTable(workbook, MergeExportNames.SheetNames[2],
            SingleTableGrid(rightHeaders, right, scope));
        onProgress?.Invoke(90, "حفظ ملف Excel…");
        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        var bytes = OpenXmlRtl.ApplyRightToLeft(ms.ToArray(), MergeExportNames.SheetNames);
        onProgress?.Invoke(100, null);
        return bytes;
    }

    public static string FileName(string scope, DateTime? today = null)
    {
        var date = (today ?? DateTime.UtcNow).ToString("yyyy-MM-dd");
        return scope == "all" ? $"دمج-الملفات-كامل-{date}.xlsx" : $"دمج-الملفات-مؤكد-{date}.xlsx";
    }
}
