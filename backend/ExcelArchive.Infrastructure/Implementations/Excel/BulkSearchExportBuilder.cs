using ClosedXML.Excel;
using ExcelArchive.Application.DTOs.BulkSearchDto;
using ExcelArchive.Domain.Text;
using ExcelArchive.Infrastructure.Implementations.Excel;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>
/// Bulk-search result workbook (ملف نتائج الاكسيل): every searched value in
/// sequence order — each matched value repeated for every matching archive
/// row above the high-match threshold, each unmatched value as a single row
/// with empty file/row/match cells. Header in archive green, data rows banded
/// per searched-value sequence. Built per request and streamed back directly —
/// never stored on the server.
/// </summary>
public static class BulkSearchExportBuilder
{
    public const string SheetName = "نتائج البحث الجماعي";

    private static readonly string[] Headers =
    [
        "التسلسل",
        "القيمة التي بحثت عنها",
        "نوع القيمة",
        "اسم الملف",
        "رقم السطر",
        "الاسم الثلاثي",
        "الرقم الوطني",
        "الشام كاش",
        "الرقم الذاتي",
        "نسبة التطابق",
    ];

    private const double MaxColumnWidth = 200.0 / 7;
    private const double MinColumnWidth = 10;
    private const int RowHeightPoints = 30;

    public static byte[] Build(
        IReadOnlyList<BulkSearchRow> rows,
        string field,
        IReadOnlyList<BulkSearchUnmatched>? unmatched = null)
    {
        var fieldLabel = BulkSearchMatch.LabelFor(field);
        // A sequence is either matched or unmatched: merge both lists and
        // keep sequence order (OrderBy is stable, so the caller's
        // per-sequence match ordering is preserved).
        var combined = new List<(BulkSearchRow Row, bool Blank)>(rows.Count + (unmatched?.Count ?? 0));
        foreach (var row in rows) combined.Add((row, false));
        if (unmatched is not null)
            foreach (var item in unmatched)
                combined.Add((new BulkSearchRow(
                    item.Sequence, item.Query, field, "", "", 0,
                    null, null, null, null, 0), true));
        var ordered = combined.OrderBy(x => x.Row.Sequence).ToList();
        using var workbook = new XLWorkbook();
        workbook.Properties.Author = "نظام أرشفة ملفات الإكسل";
        workbook.Properties.Created = DateTime.UtcNow;
        var sheet = workbook.Worksheets.Add(SheetName);

        for (var i = 0; i < Headers.Length; i++)
            sheet.Cell(1, i + 1).Value = Headers[i];
        for (var r = 0; r < ordered.Count; r++)
        {
            var (row, blank) = ordered[r];
            sheet.Cell(r + 2, 1).Value = row.Sequence;
            sheet.Cell(r + 2, 2).Value = FileExportBuilder.FitCellText(row.QueryValue);
            sheet.Cell(r + 2, 3).Value = fieldLabel;
            if (blank) continue; // unmatched value: file/row/match cells stay empty
            sheet.Cell(r + 2, 4).Value = FileExportBuilder.FitCellText(row.FileName);
            sheet.Cell(r + 2, 5).Value = row.RowIndex;
            sheet.Cell(r + 2, 6).Value = FileExportBuilder.FitCellText(row.FullName);
            sheet.Cell(r + 2, 7).Value = FileExportBuilder.FitCellText(row.NationalId);
            // Stored spaceless (16 digits): display grouped 4-4-4-4 pinned
            // LTR so the RTL sheet view never reverses the groups.
            var sham = sheet.Cell(r + 2, 8);
            sham.Value = FileExportBuilder.FitCellText(ShamCash.Format(row.ShamCash));
            sham.Style.NumberFormat.Format = "@";
            sham.Style.Alignment.ReadingOrder = XLAlignmentReadingOrderValues.LeftToRight;
            sheet.Cell(r + 2, 9).Value = FileExportBuilder.FitCellText(row.PersonalNo);
            sheet.Cell(r + 2, 10).Value = $"{row.MatchPercent}%";
        }

        if (ordered.Count > 0)
            sheet.Range(1, 1, ordered.Count + 1, Headers.Length).SetAutoFilter();

        var headerRow = sheet.Row(1);
        headerRow.Style.Font.Bold = true;
        headerRow.Style.Font.FontColor = XLColor.White;
        headerRow.Style.Fill.PatternType = XLFillPatternValues.Solid;
        headerRow.Style.Fill.BackgroundColor = XLColor.FromHtml("#548235");

        // Band rows per searched-value sequence so each query block reads
        // as one group (odd sequences white, even sequences light green).
        for (var r = 0; r < ordered.Count; r++)
        {
            if (ordered[r].Row.Sequence % 2 != 0) continue;
            var band = sheet.Range(r + 2, 1, r + 2, Headers.Length);
            band.Style.Fill.PatternType = XLFillPatternValues.Solid;
            band.Style.Fill.BackgroundColor = XLColor.FromHtml("#E2EFDA");
        }

        var fullRange = sheet.Range(1, 1, ordered.Count + 1, Headers.Length);
        fullRange.Style.Border.TopBorder = XLBorderStyleValues.Thin;
        fullRange.Style.Border.LeftBorder = XLBorderStyleValues.Thin;
        fullRange.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
        fullRange.Style.Border.RightBorder = XLBorderStyleValues.Thin;
        fullRange.Style.Border.TopBorderColor = XLColor.FromHtml("#BFBFBF");
        fullRange.Style.Border.LeftBorderColor = XLColor.FromHtml("#BFBFBF");
        fullRange.Style.Border.BottomBorderColor = XLColor.FromHtml("#BFBFBF");
        fullRange.Style.Border.RightBorderColor = XLColor.FromHtml("#BFBFBF");
        fullRange.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        fullRange.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        fullRange.Style.Alignment.WrapText = true;
        for (var r = 1; r <= ordered.Count + 1; r++)
            sheet.Row(r).Height = RowHeightPoints;

        for (var c = 0; c < Headers.Length; c++)
        {
            var longest = DisplayLength(Headers[c]);
            foreach (var (row, blank) in ordered)
            {
                var text = CellText(row, c, blank);
                if (text.Length == 0) continue;
                longest = Math.Max(longest, DisplayLength(text));
                if (longest + 2 >= MaxColumnWidth) break;
            }
            sheet.Column(c + 1).Width = Math.Min(MaxColumnWidth, Math.Max(MinColumnWidth, longest + 2));
        }

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        return OpenXmlRtl.ApplyRightToLeft(ms.ToArray(), [SheetName]);
    }

    public static string FileName(DateTime? today = null)
        => $"البحث-الجماعي-نتائج-{(today ?? DateTime.UtcNow):yyyy-MM-dd}.xlsx";

    private static string CellText(BulkSearchRow row, int column, bool blank) => column switch
    {
        0 => row.Sequence.ToString(),
        1 => row.QueryValue,
        2 => BulkSearchMatch.LabelFor(row.Field),
        // Unmatched values keep file/row/match cells empty.
        _ when blank => "",
        3 => row.FileName,
        4 => row.RowIndex.ToString(),
        5 => row.FullName ?? "",
        6 => row.NationalId ?? "",
        7 => ShamCash.Format(row.ShamCash),
        8 => row.PersonalNo ?? "",
        9 => $"{row.MatchPercent}%",
        _ => "",
    };

    private static int DisplayLength(string text)
    {
        var length = 0.0;
        foreach (var ch in text) length += ch > 255 ? 1.6 : 1;
        return (int)Math.Ceiling(length);
    }
}
