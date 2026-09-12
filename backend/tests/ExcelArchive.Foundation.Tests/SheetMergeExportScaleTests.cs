using ClosedXML.Excel;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using ExcelArchive.Infrastructure.Implementations.Excel;

// Large-export regression: OpenXML over a fixed-size buffer throws
// NotSupportedException ("Memory stream is not expandable") once the export
// outgrows it, so exports must go through OpenXmlRtl (expandable stream).
public sealed class SheetMergeExportScaleTests
{
    [Fact]
    public void ApplyRightToLeft_SetsRtlOnAllSheets()
    {
        byte[] bytes;
        using (var wb = new XLWorkbook())
        {
            wb.Worksheets.Add("A").Cell(1, 1).Value = "x";
            wb.Worksheets.Add("ب").Cell(1, 1).Value = "y";
            using var ms = new MemoryStream();
            wb.SaveAs(ms);
            bytes = ms.ToArray();
        }
        var result = OpenXmlRtl.ApplyRightToLeft(bytes, ["A", "ب", "مفقودة"]);
        using var stream = new MemoryStream(result, writable: false);
        using var doc = SpreadsheetDocument.Open(stream, false);
        var parts = doc.WorkbookPart!;
        foreach (var name in new[] { "A", "ب" })
        {
            var sheet = parts.Workbook.Sheets!.Elements<Sheet>().First(s => s.Name == name);
            var ws = (WorksheetPart)parts.GetPartById(sheet.Id!);
            var view = ws.Worksheet.GetFirstChild<SheetViews>()?.GetFirstChild<SheetView>();
            Assert.True(view?.RightToLeft?.Value == true, name);
        }
    }

    [Fact]
    public async Task Export_LargeWorkbook_Succeeds()
    {
        const int rows = 6000;
        const int cols = 60;
        byte[] bytes;
        using (var wb = new XLWorkbook())
        {
            var main = wb.Worksheets.Add("Main");
            main.Cell(1, 1).Value = "الرقم الوطني";
            main.Cell(1, 2).Value = "الاسم";
            for (var c = 2; c < cols; c++) main.Cell(1, c + 1).Value = "عمود " + c;
            for (var r = 0; r < rows; r++)
            {
                main.Cell(r + 2, 1).Value = 10000000000L + r;
                main.Cell(r + 2, 2).Value = "اسم " + r;
                for (var c = 2; c < cols; c++) main.Cell(r + 2, c + 1).Value = "ق" + r;
                if (r % 2 == 0)
                    main.Row(r + 2).Style.Fill.BackgroundColor = XLColor.FromHtml("#D9E1F2");
            }
            var linked = wb.Worksheets.Add("Linked");
            linked.Cell(1, 1).Value = "الرقم الوطني";
            linked.Cell(1, 2).Value = "م";
            for (var r = 0; r < rows; r++)
            {
                linked.Cell(r + 2, 1).Value = r == rows - 1 ? 5 : 10000000000L + r;
                linked.Cell(r + 2, 2).Value = "x";
            }
            using var ms = new MemoryStream();
            wb.SaveAs(ms);
            bytes = ms.ToArray();
        }
        var cache = new Microsoft.Extensions.Caching.Memory.MemoryCache(
            new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions { SizeLimit = 2048 });
        try
        {
            var svc = new ExcelArchive.Application.Services.SheetMergeService(
                new ExcelArchive.Infrastructure.Implementations.Storage.SheetMergeStore(cache),
                new ExcelArchive.Infrastructure.Implementations.Excel.SheetMergeParser(),
                new ExcelArchive.Infrastructure.Implementations.Excel.SheetMergeExportBuilderAdapter());
            var up = await svc.UploadAsync(bytes, "big.xlsx");
            var run = await svc.RunAsync(up.UploadId, 0, ["Linked"]);
            var ready = await svc.PrepareExportAsync(run.SessionId);
            Assert.True(ready.Size > 0);
            var (buffer, _, _) = svc.Download(ready.DownloadId);
            using var wb = new XLWorkbook(new MemoryStream(buffer, writable: false));
            Assert.Equal(ready.SheetCount, wb.Worksheets.Count);
        }
        finally
        {
            cache.Dispose();
        }
    }
}
