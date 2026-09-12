using ExcelArchive.Application.DTOs.MergeDto;
using ExcelArchive.Infrastructure.Implementations.Excel;
using ExcelArchive.Infrastructure.Implementations.Storage;
using ExcelArchive.Application.Services;
using ClosedXML.Excel;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P5.2: three-sheet confirmed/all export (V1 layout + ordering).</summary>
public sealed class MergeP52Tests
{
    private static MergeService LiveService(out Microsoft.Extensions.Caching.Memory.IMemoryCache cache)
    {
        cache = new Microsoft.Extensions.Caching.Memory.MemoryCache(
            new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions { SizeLimit = 2048 });
        return new MergeService(
            new MergeFileStore(cache),
            new MergeSessionStore(cache),
            new MergeExportStore(cache),
            new MergeWorkbookReader(),
            new MergeExportBuilderAdapter());
    }

    private static byte[] WorkbookBytes(string sheet, string[] headers, params string[][] rows)
    {
        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add(sheet);
        for (var i = 0; i < headers.Length; i++) ws.Cell(1, i + 1).Value = headers[i];
        for (var r = 0; r < rows.Length; r++)
            for (var c = 0; c < headers.Length; c++)
                ws.Cell(r + 2, c + 1).Value = rows[r][c];
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static MergeRunArgs Args(Guid lt, string ls, Guid rt, string rs) => new(
        lt, ls, new Dictionary<string, int> { ["fullName"] = 0, ["motherName"] = 1 },
        rt, rs, new Dictionary<string, int> { ["fullName"] = 0, ["motherName"] = 1 },
        false);

    [Fact]
    public void Export_ThreeSheets_ConfirmedVsAll()
    {
        var svc = LiveService(out var cache);
        try
        {
            var headers = new[] { "الاسم الثلاثي", "اسم الأم" };
            var left = svc.Inspect(WorkbookBytes("A", headers,
                ["محمد أحمد علي", "فاطمة"],
                ["خالد سعيد", "نور"],
                ["زائدة", "أم"]), "l.xlsx");
            var right = svc.Inspect(WorkbookBytes("B", headers,
                ["محمد أحمد علي", "فاطمة"],
                ["أخرى", "أم"]), "r.xlsx");
            var run = svc.Run(Args(left.Token, left.Selected.SheetName, right.Token, right.Selected.SheetName));
            Assert.Single(run.Result.Pairs);

            var (confirmed, confirmedName) = svc.ExportScoped(run.SessionId, "confirmed");
            Assert.StartsWith("دمج-الملفات-مؤكد-", confirmedName);
            using (var wb = new XLWorkbook(new MemoryStream(confirmed)))
            {
                Assert.Equal(3, wb.Worksheets.Count);
                Assert.Equal("الدمج الكامل", wb.Worksheets.First().Name);
                var full = wb.Worksheets.First();
                // Header + 1 linked pair only.
                Assert.Equal(2, full.LastRowUsed()!.RowNumber());
                Assert.Equal("مفتاح الربط", full.Cell(1, 1).GetString());
                Assert.StartsWith("A_", full.Cell(1, 2).GetString());
                var tableA = wb.Worksheets.Skip(1).First();
                Assert.Equal("الجدول A", tableA.Name);
                // الجدول A يعرض كل السطور: 3 يسارية + ترويسة = 4.
                Assert.Equal(4, tableA.LastRowUsed()!.RowNumber());
                var tableB = wb.Worksheets.Skip(2).First();
                Assert.Equal("الجدول B", tableB.Name);
                // الجدول B يعرض كل السطور: 2 يمينية + ترويسة = 3.
                Assert.Equal(3, tableB.LastRowUsed()!.RowNumber());
            }

            var (all, allName) = svc.ExportScoped(run.SessionId, "all");
            Assert.StartsWith("دمج-الملفات-كامل-", allName);
            using (var wb = new XLWorkbook(new MemoryStream(all)))
            {
                var full = wb.Worksheets.First();
                // Inner join: header + 1 matched pair only (unlinked rows excluded).
                Assert.Equal(2, full.LastRowUsed()!.RowNumber());
                Assert.Equal("التأكد", full.Cell(1, 2).GetString());
                Assert.Equal("0001", full.Cell(2, 1).GetString());
                Assert.Equal("مؤكد", full.Cell(2, 2).GetString());
            }
        }
        finally
        {
            cache.Dispose();
        }
    }

    [Fact]
    public void Export_Pre1900Date_StaysText_DoesNotThrow()
    {
        var svc = LiveService(out var cache);
        try
        {
            var headers = new[] { "الاسم الثلاثي", "اسم الأم", "تاريخ الميلاد" };
            var left = svc.Inspect(WorkbookBytes("A", headers,
                ["محمد أحمد علي", "فاطمة", "05/06/0025"],
                ["خالد سعيد", "نور", "01/01/1990"]), "l.xlsx");
            var right = svc.Inspect(WorkbookBytes("B", headers,
                ["محمد أحمد علي", "فاطمة", "05/06/0025"],
                ["أخرى", "أم", "02/02/2000"]), "r.xlsx");
            var run = svc.Run(Args(left.Token, left.Selected.SheetName, right.Token, right.Selected.SheetName));
            // كان يرمي OverflowException ("Not a legal OleAut date") أثناء البناء.
            var (bytes, _) = svc.ExportScoped(run.SessionId, "confirmed");
            using var wb = new XLWorkbook(new MemoryStream(bytes));
            Assert.Equal(3, wb.Worksheets.Count);
            var full = wb.Worksheets.First();
            Assert.Equal("05/06/0025", full.Cell(2, 4).GetString());
        }
        finally
        {
            cache.Dispose();
        }
    }

    [Fact]
    public void Export_InvalidScope_Throws()
    {
        var svc = LiveService(out var cache);
        try
        {
            var headers = new[] { "الاسم الثلاثي" };
            var left = svc.Inspect(WorkbookBytes("A", headers, ["أ"]), "l.xlsx");
            var run = svc.Run(new MergeRunArgs(
                left.Token, left.Selected.SheetName, new Dictionary<string, int> { ["fullName"] = 0 },
                left.Token, left.Selected.SheetName, new Dictionary<string, int> { ["fullName"] = 0 }, false));
            Assert.Throws<InvalidDataException>(() => svc.ExportScoped(run.SessionId, "bogus"));
            Assert.Throws<KeyNotFoundException>(() => svc.ExportScoped(Guid.NewGuid(), "confirmed"));
        }
        finally
        {
            cache.Dispose();
        }
    }
}
