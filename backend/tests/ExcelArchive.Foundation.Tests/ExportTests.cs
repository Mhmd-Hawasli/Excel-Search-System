using ClosedXML.Excel;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using ExcelArchive.Infrastructure.Implementations.Excel;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P2.6 export tests: semantic workbook comparison (docs/09), not ZIP bytes.</summary>
public sealed class ExportTests
{
    private static byte[] BuildSample(out List<ExportRecord> records, out List<ExportEdit> edits, bool markEdits = false)
    {
        records =
        [
            new ExportRecord(Guid.NewGuid(), 2,
                new Dictionary<string, string> { ["الاسم"] = "أحمد", ["الرقم"] = "00123", ["التاريخ"] = "05/09/2024" },
                new Dictionary<string, string> { ["الاسم"] = "FFFF0000" },
                new Dictionary<string, string> { ["الرقم"] = "FF0000FF" },
                "أحمد محمد علي", "00123"),
            new ExportRecord(Guid.NewGuid(), 3,
                new Dictionary<string, string> { ["الاسم"] = "سارة", ["الرقم"] = "999", ["التاريخ"] = "not-a-date" },
                null, null, "سارة خالد حسن", "999"),
        ];
        edits =
        [
            new ExportEdit(records[0].Id.ToString(), "الاسم", "محمد", "أحمد", "test", new DateTime(2025, 12, 31, 10, 30, 0, DateTimeKind.Utc)),
        ];
        return FileExportBuilder.Build("ورقة البيانات", ["الاسم", "الرقم", "التاريخ"], records, edits, markEdits);
    }

    private static XLWorkbook Load(byte[] bytes) => new(new MemoryStream(bytes, writable: false));

    [Fact]
    public void Export_PreservesValues_Styles_Dates_Edits()
    {
        var bytes = BuildSample(out var records, out _);
        using var wb = Load(bytes);
        var sheet = wb.Worksheets.First(w => w.Name == "ورقة البيانات");

        Assert.Equal("أحمد", sheet.Cell("A2").GetString());
        Assert.Equal("00123", sheet.Cell("B2").GetString());
        Assert.Equal(XLDataType.DateTime, sheet.Cell("C2").DataType);
        Assert.Equal(new DateTime(2024, 9, 5), sheet.Cell("C2").GetDateTime());
        Assert.Equal("DD/MM/YYYY", sheet.Cell("C2").Style.DateFormat.Format);
        Assert.Equal("not-a-date", sheet.Cell("C3").GetString());

        Assert.Equal("FFFF0000", sheet.Cell("A2").Style.Fill.BackgroundColor.Color.ToArgb().ToString("X8"));
        Assert.Equal("FF0000FF", sheet.Cell("B2").Style.Font.FontColor.Color.ToArgb().ToString("X8"));
        Assert.Equal("FFFFC000", sheet.Row(1).Cell(1).Style.Fill.BackgroundColor.Color.ToArgb().ToString("X8"));

        Assert.True(sheet.Tables.Any());
        Assert.Equal(30, sheet.Row(2).Height);
    }

    [Fact]
    public void Export_HistorySheet_ListsOriginals()
    {
        // Second sheet is created only when markEdits is requested.
        var bytes = BuildSample(out var records, out _, markEdits: true);
        using var wb = Load(bytes);
        var log = wb.Worksheets.First(w => w.Name == "سجل التعديلات");
        Assert.Equal("رقم السطر", log.Cell(1, 1).GetString());
        Assert.Equal("الاسم الثلاثي", log.Cell(1, 2).GetString());
        Assert.Equal("الرقم الوطني", log.Cell(1, 3).GetString());
        Assert.Equal("اسم العمود", log.Cell(1, 4).GetString());
        Assert.Equal("القيمة القديمة", log.Cell(1, 5).GetString());
        Assert.Equal("القيمة الحديثة", log.Cell(1, 6).GetString());
        Assert.Equal("اسم حساب الشخص الذي عدل", log.Cell(1, 7).GetString());
        Assert.Equal("تاريخ التعديل", log.Cell(1, 8).GetString());
        Assert.Equal(2, log.Cell(2, 1).GetValue<int>());
        Assert.Equal("أحمد محمد علي", log.Cell(2, 2).GetString());
        Assert.Equal("الاسم", log.Cell(2, 4).GetString());
        Assert.Equal("محمد", log.Cell(2, 5).GetString());
        Assert.Equal("أحمد", log.Cell(2, 6).GetString());
        Assert.Equal("test", log.Cell(2, 7).GetString());
        Assert.Equal(new DateTime(2025, 12, 31), log.Cell(2, 8).GetDateTime().Date);
        Assert.Equal("DD/MM/YYYY", log.Cell(2, 8).Style.DateFormat.Format);
    }

    [Fact]
    public void Export_MarkEdits_HighlightsCellsOrangeWithRedFont()
    {
        var bytes = BuildSample(out _, out _, markEdits: true);
        using var wb = Load(bytes);
        var sheet = wb.Worksheets.First(w => w.Name == "ورقة البيانات");
        // Edited cell A2: orange fill + red font (overrides source colors).
        Assert.Equal("FFFFC000", sheet.Cell("A2").Style.Fill.BackgroundColor.Color.ToArgb().ToString("X8"));
        Assert.Equal("FFFF0000", sheet.Cell("A2").Style.Font.FontColor.Color.ToArgb().ToString("X8"));
        // Unedited cell keeps its source style.
        Assert.Equal("FF0000FF", sheet.Cell("B2").Style.Font.FontColor.Color.ToArgb().ToString("X8"));
    }

    [Fact]
    public void Export_WithoutMarkEdits_NoHighlight_NoHistorySheet()
    {
        var bytes = BuildSample(out _, out _);
        using var wb = Load(bytes);
        var sheet = wb.Worksheets.First(w => w.Name == "ورقة البيانات");
        // Source fill preserved, no red font override.
        Assert.Equal("FFFF0000", sheet.Cell("A2").Style.Fill.BackgroundColor.Color.ToArgb().ToString("X8"));
        Assert.DoesNotContain(wb.Worksheets, w => w.Name == "سجل التعديلات");
    }

    [Fact]
    public void Export_MarkEdits_ArchivedEdit_RendersDashes()
    {
        var records = new List<ExportRecord>
        {
            new(Guid.NewGuid(), 2, new Dictionary<string, string> { ["الاسم"] = "x" }, null, null, "فلان", "123"),
        };
        var edits = new List<ExportEdit>
        {
            new(null, "الاسم", "قديم", "جديد", "test", new DateTime(2025, 12, 31, 0, 0, 0, DateTimeKind.Utc)),
        };
        var bytes = FileExportBuilder.Build("S", ["الاسم"], records, edits, markEdits: true);
        using var wb = Load(bytes);
        var log = wb.Worksheets.First(w => w.Name == "سجل التعديلات");
        Assert.Equal("—", log.Cell(2, 1).GetString());
        Assert.Equal("—", log.Cell(2, 2).GetString());
    }

    [Fact]
    public void Export_RtlViews_Set()
    {
        var bytes = BuildSample(out _, out _);
        using var ms = new MemoryStream(bytes);
        using var doc = SpreadsheetDocument.Open(ms, false);
        var names = doc.WorkbookPart!.Workbook.Sheets!.Elements<Sheet>().Select(s => s.Name!.Value).ToList();
        Assert.Contains("ورقة البيانات", names);
        foreach (var sheet in doc.WorkbookPart!.Workbook.Sheets!.Elements<Sheet>())
        {
            var part = (WorksheetPart)doc.WorkbookPart.GetPartById(sheet.Id!);
            var view = part.Worksheet.GetFirstChild<SheetViews>()?.GetFirstChild<SheetView>();
            Assert.True(view?.RightToLeft?.Value == true, sheet.Name);
        }
    }

    [Fact]
    public void Export_NoEdits_NoHistorySheet()
    {
        var bytes = FileExportBuilder.Build("S", ["h"],
            [new ExportRecord(Guid.NewGuid(), 2, new Dictionary<string, string> { ["h"] = "v" }, null, null)], []);
        using var wb = Load(bytes);
        Assert.DoesNotContain(wb.Worksheets, w => w.Name == "سجل التعديلات");
    }

    [Theory]
    [InlineData("05/09/2024", "2024-09-05")]
    [InlineData("2024-9-5", "2024-09-05")]
    [InlineData("31/02/2024", null)]
    [InlineData("hello", null)]
    [InlineData("", null)]
    public void ParseStoredDate_Validates(string input, string? expected)
    {
        var parsed = FileExportBuilder.ParseStoredDate(input);
        if (expected is null) Assert.Null(parsed);
        else Assert.Equal(DateTime.Parse(expected), parsed);
    }

    [Fact]
    public void UniqueTableColumnNames_Sanitizes()
    {
        Assert.Equal(["a", "b", "b (2)", "عمود 4"],
            FileExportBuilder.UniqueTableColumnNames(["a", "b", "b", "  "]));
        Assert.Equal(["x y"], FileExportBuilder.UniqueTableColumnNames(["x\ny"]));
    }
}
