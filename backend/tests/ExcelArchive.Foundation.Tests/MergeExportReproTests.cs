using ExcelArchive.Application.Services;
using ExcelArchive.Domain.Merge;
using ExcelArchive.Infrastructure.Implementations.Excel;
using ExcelArchive.Infrastructure.Implementations.Storage;
using Microsoft.Extensions.Caching.Memory;

namespace ExcelArchive.Foundation.Tests;

/// <summary>Regression for the /merge export 500: over-long cell text
/// (beyond Excel's 32,767-char limit) must be truncated, never throw.</summary>
public sealed class MergeExportReproTests
{
    private static List<MergeRow> BuildRows(int count, int cols, double linkedRatio)
    {
        var rows = new List<MergeRow>(count);
        var linkedCount = (int)(count * linkedRatio);
        for (var i = 0; i < count; i++)
        {
            var cells = new List<string>(cols);
            for (var c = 0; c < cols; c++) cells.Add($"قيمة {i}-{c} محمد أحمد علي");
            var linked = i < linkedCount;
            rows.Add(new MergeRow
            {
                RowNumber = i + 2,
                Cells = cells,
                Key = linked ? (i + 1).ToString("D4") : null,
                Rule = linked ? "full_name" : null,
                Confirmed = linked,
            });
        }
        return rows;
    }

    [Fact]
    public void Export_LargeTables_BothScopes()
    {
        var leftHeaders = new[] { "الاسم الثلاثي", "اسم الأم", "الرقم الوطني", "الهاتف", "ملاحظات" };
        var rightHeaders = new[] { "الاسم", "اسم الام", "الرقم الوطني", "رقم الهاتف" };
        var left = BuildRows(8185, leftHeaders.Length, 0.9);
        var right = BuildRows(7520, rightHeaders.Length, 0.97);

        var confirmed = MergeExportBuilder.Build(leftHeaders, left, rightHeaders, right, "confirmed");
        Assert.True(confirmed.Length > 0);
        var all = MergeExportBuilder.Build(leftHeaders, left, rightHeaders, right, "all");
        Assert.True(all.Length > 0);
    }

    [Fact]
    public void Export_ColumnNPatternHeaders_DoNotThrow()
    {
        // Production 500 on /merge/export: a real header literally named
        // "Column6" collided with ClosedXML's auto-generated Column1..N field
        // names when headers were written AFTER CreateTable (RenameField threw
        // "An item with the same key has already been added. Key: Column6").
        var headers = new[]
        {
            "الاسم الثلاثي", "Column6", "اسم الأم", "COLUMN2", "الرقم الوطني",
            "column10", "الهاتف", "ملاحظات",
        };
        Cells(headers, out var left, out var right);
        var confirmed = MergeExportBuilder.Build(headers, left, headers, right, "confirmed");
        Assert.True(confirmed.Length > 0);
        var all = MergeExportBuilder.Build(headers, left, headers, right, "all");
        Assert.True(all.Length > 0);
        using var wb = new ClosedXML.Excel.XLWorkbook(new MemoryStream(confirmed));
        Assert.Equal(3, wb.Worksheets.Count);
    }

    private static void Cells(IReadOnlyList<string> headers, out List<MergeRow> left, out List<MergeRow> right)
    {
        var cells = headers.Select((h, i) => $"خلية {i}").ToList();
        left =
        [
            new() { RowNumber = 2, Cells = new List<string>(cells),
                Key = "0001", Rule = "full_name", Confirmed = true },
        ];
        right =
        [
            new() { RowNumber = 2, Cells = new List<string>(cells),
                Key = "0001", Rule = "full_name", Confirmed = true },
        ];
    }

    [Fact]
    public async Task PrepareExportAsync_ThenDownload_RoundTrips()
    {
        using var cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 2048 });
        var sessions = new MergeSessionStore(cache);
        var svc = new MergeService(
            new MergeFileStore(cache), sessions, new MergeExportStore(cache),
            new MergeWorkbookReader(), new MergeExportBuilderAdapter());
        var headers = new List<string> { "الاسم الثلاثي", "Column6", "الهاتف" };
        var session = sessions.Create(
            "A", headers,
            [new MergeRow { RowNumber = 2, Cells = ["محمد أحمد علي", "x", "0999"], Key = "0001", Rule = "full_name", Confirmed = true }],
            MergeMapping.Empty,
            "B", headers,
            [new MergeRow { RowNumber = 2, Cells = ["محمد أحمد علي", "x", "0999"], Key = "0001", Rule = "full_name", Confirmed = true }],
            MergeMapping.Empty, false);
        var progress = new List<int>();
        var ready = await svc.PrepareExportAsync(session.Id, "confirmed",
            (percent, _) => progress.Add(percent));
        Assert.NotEqual(Guid.Empty, ready.DownloadId);
        Assert.EndsWith(".xlsx", ready.Filename);
        Assert.True(ready.Size > 0);
        Assert.Contains(100, progress);
        var (bytes, filename, size) = svc.DownloadExport(ready.DownloadId);
        Assert.Equal(ready.Size, size);
        Assert.Equal(ready.Filename, filename);
        Assert.True(bytes.Length > 0);
        using var wb = new ClosedXML.Excel.XLWorkbook(new MemoryStream(bytes));
        Assert.Equal(3, wb.Worksheets.Count);
    }

    [Fact]
    public void Export_NastyHeaders_DoNotThrow()
    {
        var headers = new[]
        {
            "الاسم الثلاثي", "الاسم الثلاثي", "", "   ",
            "عمود[1]", "نسبة%*؟", "A/B\\C:D", new string('ط', 300),
            "سطر\nأول", "اقتباس\"نص\"",
        };
        var cells = headers.Select((h, i) => $"خلية {i}").ToList();
        var left = new List<MergeRow>
        {
            new() { RowNumber = 2, Cells = new List<string>(cells),
                Key = "0001", Rule = "full_name", Confirmed = true },
        };
        var right = new List<MergeRow>
        {
            new() { RowNumber = 2, Cells = new List<string>(cells),
                Key = "0001", Rule = "full_name", Confirmed = true },
        };
        var confirmed = MergeExportBuilder.Build(headers, left, headers, right, "confirmed");
        Assert.True(confirmed.Length > 0);
        var all = MergeExportBuilder.Build(headers, left, headers, right, "all");
        Assert.True(all.Length > 0);
    }

    [Fact]
    public void Export_OversizedCell_DoNotThrow()
    {
        var headers = new[] { "الاسم الثلاثي", "ملاحظات" };
        var huge = new string('ن', 40000);
        var left = new List<MergeRow>
        {
            new() { RowNumber = 2, Cells = ["محمد أحمد علي", huge],
                Key = "0001", Rule = "full_name", Confirmed = true },
        };
        var right = new List<MergeRow>
        {
            new() { RowNumber = 2, Cells = ["محمد أحمد علي", "عادي"],
                Key = "0001", Rule = "full_name", Confirmed = true },
        };
        var confirmed = MergeExportBuilder.Build(headers, left, headers, right, "confirmed");
        Assert.True(confirmed.Length > 0);
        using var wb = new ClosedXML.Excel.XLWorkbook(new MemoryStream(confirmed));
        var full = wb.Worksheets.First();
        Assert.Equal(FileExportBuilder.MaxCellTextLength, full.Cell(2, 3).GetString().Length);
    }

    [Fact]
    public void Export_CellsWithControlChars_DoNotThrow()
    {
        var headers = new[] { "الاسم الثلاثي", "ملاحظات" };
        var nasty = "نص" + ((char)1).ToString() + "بمحارف تحكم" + ((char)7).ToString() + "!";
        var left = new List<MergeRow>
        {
            new() { RowNumber = 2, Cells = ["محمد أحمد علي", "سطر أول\vسطر ثاني"],
                Key = "0001", Rule = "full_name", Confirmed = true },
            new() { RowNumber = 3, Cells = ["خالد سعيد حمل", nasty],
                Key = "0002", Rule = "full_name", Confirmed = true },
        };
        var right = new List<MergeRow>
        {
            new() { RowNumber = 2, Cells = ["محمد أحمد علي", "عادي"],
                Key = "0001", Rule = "full_name", Confirmed = true },
        };
        var confirmed = MergeExportBuilder.Build(headers, left, headers, right, "confirmed");
        Assert.True(confirmed.Length > 0);
        var all = MergeExportBuilder.Build(headers, left, headers, right, "all");
        Assert.True(all.Length > 0);
    }
}
