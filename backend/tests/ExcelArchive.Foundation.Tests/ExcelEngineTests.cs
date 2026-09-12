using ClosedXML.Excel;
using ExcelArchive.Domain.Text;
using ExcelArchive.Infrastructure.Implementations.Excel;
using ExcelArchive.Infrastructure.Implementations.Storage;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P2.2 Excel engine tests over ClosedXML-built workbooks.
/// Mirrors V1 table-range/cell-value/cell-style/workbook test intent.</summary>
public sealed class ExcelEngineTests : IDisposable
{
    private readonly List<XLWorkbook> _workbooks = [];

    private XLWorkbook Book()
    {
        var wb = new XLWorkbook();
        _workbooks.Add(wb);
        return wb;
    }

    public void Dispose()
    {
        foreach (var wb in _workbooks) wb.Dispose();
        _workbooks.Clear();
    }

    private static byte[] Save(XLWorkbook wb)
    {
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    [Fact]
    public void ParseTableRef_AcceptsA1ToleratesDollars()
    {
        var parsed = ExcelTableRange.ParseTableRef("B4:D8");
        Assert.NotNull(parsed);
        Assert.Equal((4, 8, 2, 4), (parsed.Value.FirstRow, parsed.Value.LastRow, parsed.Value.FirstCol, parsed.Value.LastCol));
        Assert.NotNull(ExcelTableRange.ParseTableRef("$B$4:$D$8"));
        Assert.Null(ExcelTableRange.ParseTableRef("nope"));
        Assert.Null(ExcelTableRange.ParseTableRef(null));
    }

    [Fact]
    public void TableDetection_FirstTableWins_TotalsExcluded_PlainNull()
    {
        using var wb = Book();
        var ws = wb.Worksheets.Add("S");
        ws.Cell("A1").Value = "outside";
        foreach (var (c, h) in new[] { ("B", "h1"), ("C", "h2"), ("D", "h3") })
            ws.Cell($"{c}4").Value = h;
        for (var r = 5; r <= 7; r++)
            foreach (var c in new[] { "B", "C", "D" }) ws.Cell($"{c}{r}").Value = r;
        foreach (var c in new[] { "B", "C", "D" }) ws.Cell($"{c}8").Value = "total";
        ws.Range("B4:D8").CreateTable("T1");
        ws.Tables.First().SetShowTotalsRow(true);
        var table = ExcelTableRange.ForSheet(ws);
        Assert.NotNull(table);
        Assert.Equal(new SheetTableRange(4, 5, 7, 2, 4), table);

        using var plain = Book();
        Assert.Null(ExcelTableRange.ForSheet(plain.Worksheets.Add("P")));
    }

    [Fact]
    public void CellText_PreservesScalars_ZeroFalse()
    {
        using var wb = Book();
        var ws = wb.Worksheets.Add("S");
        ws.Cell("A1").Value = 0;
        ws.Cell("A2").Value = false;
        ws.Cell("A3").Value = 12.5;
        ws.Cell("A4").Value = "نص";
        ws.Cell("A5").Value = 1234567890123456d;
        Assert.Equal("0", ExcelCellReader.CellText(ws.Cell("A1")));
        Assert.Equal("false", ExcelCellReader.CellText(ws.Cell("A2")));
        Assert.Equal("12.5", ExcelCellReader.CellText(ws.Cell("A3")));
        Assert.Equal("نص", ExcelCellReader.CellText(ws.Cell("A4")));
        Assert.Equal("1234567890123456", ExcelCellReader.CellText(ws.Cell("A5")));
        Assert.Equal("", ExcelCellReader.CellText(ws.Cell("A9")));
    }

    [Fact]
    public void CellText_UsesCachedFormula_EmptyWhenUncachedOrError()
    {
        using var wb = Book();
        var ws = wb.Worksheets.Add("S");
        ws.Cell("A1").Value = 41;
        ws.Cell("A2").FormulaA1 = "=A1+1";
        ws.Cell("A2").Value = 42;
        Assert.Equal("42", ExcelCellReader.CellText(ws.Cell("A2")));

        // No saved result (never recalculated): empty, never an import failure.
        ws.Cell("B1").FormulaA1 = "=1/0";
        Assert.Equal("", ExcelCellReader.CellText(ws.Cell("B1")));

        // Erroneous saved result (#NAME?): empty, the error text never becomes data.
        ws.Cell("C1").FormulaA1 = "=NOSUCHFUNC(A1)";
        ws.Cell("C1").Value = XLError.NameNotRecognized;
        Assert.True(ws.Cell("C1").CachedValue.IsError);
        Assert.Equal("", ExcelCellReader.CellText(ws.Cell("C1")));
    }

    [Fact]
    public void Headers_BlankPlaceholders_DuplicatesThrow()
    {
        using var wb = Book();
        var ws = wb.Worksheets.Add("S");
        ws.Cell("A1").Value = "الاسم";
        ws.Cell("B1").Value = " ";
        Assert.Equal(["الاسم", "عمود 2"], HeaderEngine.HeadersForSheet(ws, null));

        using var dup = Book();
        var ws2 = dup.Worksheets.Add("S");
        ws2.Cell("A1").Value = "الاسم";
        ws2.Cell("B1").Value = "الأسم";
        var dupEx = Assert.Throws<InvalidDataException>(() => HeaderEngine.HeadersForSheet(ws2, null));
        Assert.Contains("مكررة", dupEx.Message);
    }

    [Fact]
    public void ColumnSignature_MatchesNodeVector()
        => Assert.Equal(
            "1408ad5551b7d95c4bc990e82fc48a33e961a613adb0568bb1ca7d4cd1d658c9",
            HeaderEngine.ColumnSignature(["الاسم", "الرقم الوطني"]));

    [Theory]
    [InlineData("الاسم الثلاثي", "full_name")]
    [InlineData("رقم الموبايل", "phone")]
    [InlineData("zzzqqq", null)]
    [InlineData("الاسم", "first_name")]
    [InlineData("الاسم_الثلاثي", "full_name")]
    [InlineData("عدد_الأبناء", null)]
    [InlineData("نوع_العقد", null)]
    [InlineData("رقم الهاتف الجوال", "phone")]
    [InlineData("جوال", "phone")]
    [InlineData("اسم_الأم_الكامل", "mother_name")]
    [InlineData("اسم الموظف", "first_name")]
    public void SuggestStandardField_Catalog(string header, string? expected)
        => Assert.Equal(expected, HeaderEngine.SuggestStandardField(header));

    [Fact]
    public void Styles_ResolveFills_ThemeFonts_SkipDefault()
    {
        using var wb = Book();
        var ws = wb.Worksheets.Add("S");
        ws.Cell("A2").Style.Fill.BackgroundColor = XLColor.Red;
        ws.Cell("B2").Style.Font.FontColor = XLColor.FromTheme(XLThemeColor.Accent1);
        // Untinted theme Text1 is the file default (automatic), never stored.
        ws.Cell("C2").Style.Font.FontColor = XLColor.FromTheme(XLThemeColor.Text1);
        var formats = ExcelStyleReader.ExtractRowFormats(ws.Row(2), 3);
        Assert.Equal("FFFF0000", formats.Fills["0"]);
        Assert.Equal("FF5B9BD5", formats.Fonts["1"]);
        Assert.DoesNotContain("2", formats.Fills);
        Assert.DoesNotContain("2", formats.Fonts);
    }

    [Fact]
    public void Sidecar_RoundTrips_TablesAndFormats()
    {
        using var wb = Book();
        var ws = wb.Worksheets.Add("Main");
        ws.Cell("B4").Value = "h1";
        ws.Cell("C4").Value = "h2";
        ws.Cell("B5").Value = "v";
        ws.Range("B4:C6").CreateTable("T2");
        ws.Cell("B5").Style.Fill.BackgroundColor = XLColor.Red;
        var sidecar = new FormatSidecar(1, ["Main"],
            new Dictionary<string, Dictionary<string, RowFormats>>
            {
                ["Main"] = new() { ["5"] = new RowFormats(new() { ["0"] = "FFFF0000" }, new()) },
            },
            new Dictionary<string, SheetTableRange?> { ["Main"] = new SheetTableRange(4, 5, 6, 2, 3) });
        var json = FormatSidecarStore.Serialize(sidecar);
        var parsed = FormatSidecarStore.Deserialize(json);
        Assert.NotNull(parsed);
        Assert.Equal(new SheetTableRange(4, 5, 6, 2, 3),
            FormatSidecarStore.TableRange(parsed, "Main", 1));
        Assert.Equal("FFFF0000", FormatSidecarStore.RowFormats(parsed, "Main", 1, 5)!.Fills["0"]);
        Assert.Null(FormatSidecarStore.RowFormats(parsed, "Main", 1, 6));
        Assert.Null(FormatSidecarStore.Deserialize("{\"version\":2}"));
    }

    [Fact]
    public void TokenValidation_RejectsTraversal()
    {
        Assert.True(WorkbookFileStore.IsValidToken(Guid.NewGuid().ToString()));
        Assert.False(WorkbookFileStore.IsValidToken("../../etc/passwd"));
        Assert.False(WorkbookFileStore.IsValidToken(null));
    }

    [Fact]
    public void Inspection_EndToEnd_TableAware()
    {
        using var wb = Book();
        var ws = wb.Worksheets.Add("S");
        ws.Cell("A1").Value = "outside";
        ws.Cell("B4").Value = "الاسم";
        ws.Cell("C4").Value = "الرقم الوطني";
        ws.Cell("B5").Value = "أحمد";
        ws.Cell("C5").Value = "123456789";
        ws.Range("B4:C5").CreateTable();
        using var reloaded = SheetInspector.Load(Save(wb));
        var sheet = reloaded.Worksheets.First();
        var table = ExcelTableRange.ForSheet(sheet);
        Assert.NotNull(table);
        var inspection = SheetInspector.InspectWorksheet(reloaded, sheet, 1, table);
        Assert.Equal(["الاسم", "الرقم الوطني"], inspection.Columns.Select(c => c.HeaderRaw));
        Assert.Equal("first_name", inspection.Columns[0].SuggestedField);
        Assert.Equal("national_id", inspection.Columns[1].SuggestedField);
        Assert.Equal(1, inspection.RowCount);
        Assert.Single(inspection.Preview);
        Assert.Equal(["أحمد", "123456789"], inspection.Preview[0]);
    }
}
