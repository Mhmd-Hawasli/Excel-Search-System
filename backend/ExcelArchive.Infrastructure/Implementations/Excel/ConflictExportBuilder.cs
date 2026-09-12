using ClosedXML.Excel;
using ExcelArchive.Application.DTOs.ConflictDto;
using ExcelArchive.Domain.Text;
using ExcelArchive.Infrastructure.Implementations.Excel;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>
/// Conflict report workbook ported from V1 lib/conflicts/export.ts onto
/// ClosedXML: fixed 12 columns with V1 widths, TableStyleLight9, 30pt rows,
/// thin borders, centered wrap alignment, RTL view, padded national IDs,
/// grouped sham display, functional-category labels, rule labels.
/// </summary>
public static class ConflictExportBuilder
{
    private static readonly string[] Headers =
    [
        "رقم المشكلة", "الملف", "صف Excel", "الاسم الثلاثي", "اسم الأم",
        "الرقم الوطني", "الشام كاش", "الرقم الذاتي", "الهاتف",
        "الفئة الوظيفية", "القاعدة", "الشرح",
    ];

    private static readonly double[] Widths = [10, 28, 10, 26, 20, 18, 22, 16, 16, 18, 30, 80];

    private static readonly string[] FunctionalLabels =
    [
        "فئة الأولى", "فئة الثانية", "فئة الثالثة", "فئة الرابعة", "فئة الخامسة",
    ];

    public static string FormatSham(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        var digits = ArabicNormalizer.DigitsOnly(value);
        if (digits.Length == 0 || digits.Length > 16) return value;
        var padded = digits.PadLeft(16, '0');
        var sb = new System.Text.StringBuilder();
        for (var i = 0; i < 16; i += 4)
        {
            if (i > 0) sb.Append(' ');
            sb.Append(padded, i, 4);
        }
        return sb.ToString();
    }

    public static string FormatFunctional(int? value)
    {
        if (value is null) return "";
        return value is >= 1 and <= 5 ? FunctionalLabels[value.Value - 1] : "فئة غير معروفة";
    }

    public static byte[] Build(IReadOnlyList<ConflictRowDto> rows, CancellationToken ct = default)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("تضارب البيانات");
        // Write cells BEFORE CreateTable (see MergeExportBuilder): creating
        // over an empty header row auto-names fields Column1..N and later
        // header writes trigger a colliding RenameField.
        for (var i = 0; i < Headers.Length; i++)
            sheet.Cell(1, i + 1).Value = Headers[i];
        var r = 0;
        foreach (var row in rows)
        {
            ct.ThrowIfCancellationRequested();
            sheet.Cell(r + 2, 1).Value = row.IssueNumber;
            sheet.Cell(r + 2, 2).Value = FileExportBuilder.FitCellText(row.FileName);
            sheet.Cell(r + 2, 3).Value = row.RowIndex;
            sheet.Cell(r + 2, 4).Value = FileExportBuilder.FitCellText(row.FullName);
            sheet.Cell(r + 2, 5).Value = FileExportBuilder.FitCellText(row.MotherName);
            var national = sheet.Cell(r + 2, 6);
            national.Value = FileExportBuilder.FitCellText(row.NationalId);
            national.Style.NumberFormat.Format = "@";
            var sham = sheet.Cell(r + 2, 7);
            sham.Value = FileExportBuilder.FitCellText(FormatSham(row.ShamCash));
            sham.Style.NumberFormat.Format = "@";
            sheet.Cell(r + 2, 8).Value = FileExportBuilder.FitCellText(row.PersonalNo);
            sheet.Cell(r + 2, 9).Value = FileExportBuilder.FitCellText(row.Phone);
            sheet.Cell(r + 2, 10).Value = FormatFunctional(row.FunctionalCategory);
            sheet.Cell(r + 2, 11).Value = FileExportBuilder.FitCellText(string.Join("؛ ", row.Issues.Select(i => i.Label)));
            sheet.Cell(r + 2, 12).Value = FileExportBuilder.FitCellText(string.Join("\n---\n", row.Issues.Select(i => i.Explanation)));
            r++;
        }
        var table = sheet.Range(1, 1, rows.Count + 1, Headers.Length).CreateTable("ConflictsTable");
        table.Theme = XLTableTheme.TableStyleLight9;
        table.ShowRowStripes = false;
        table.ShowAutoFilter = true;
        var headerRow = sheet.Row(1);
        headerRow.Style.Font.Bold = true;
        headerRow.Style.Font.FontColor = XLColor.White;
        for (var rowIndex = 1; rowIndex <= rows.Count + 1; rowIndex++)
        {
            var excelRow = sheet.Row(rowIndex);
            excelRow.Height = 30;
            for (var c = 1; c <= Headers.Length; c++)
            {
                var cell = excelRow.Cell(c);
                cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                cell.Style.Alignment.WrapText = true;
                cell.Style.Border.TopBorder = XLBorderStyleValues.Thin;
                cell.Style.Border.LeftBorder = XLBorderStyleValues.Thin;
                cell.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
                cell.Style.Border.RightBorder = XLBorderStyleValues.Thin;
            }
        }
        for (var i = 0; i < Headers.Length; i++)
            sheet.Column(i + 1).Width = Widths[i];
        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        return OpenXmlRtl.ApplyRightToLeft(ms.ToArray(), ["تضارب البيانات"]);
    }
}
