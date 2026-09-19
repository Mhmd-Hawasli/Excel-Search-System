using ExcelArchive.Application.DTOs.BulkSearchDto;
using ExcelArchive.Application.DTOs.SearchDto;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Services;
using ExcelArchive.Infrastructure.Implementations.Excel;
using ExcelArchive.Infrastructure.Implementations.Storage;

namespace ExcelArchive.Foundation.Tests;

/// <summary>Bulk-search flow over real workbooks: inspect, per-value top-N
/// search, high-match filter, row repetition, direct xlsx export.</summary>
public sealed class BulkSearchFlowTests
{
    private sealed class FakeSearch(Func<SearchQuery, IReadOnlyList<SearchResultRow>> answer) : ISearchService
    {
        public Task<SearchResultSet> SearchAsync(SearchQuery query, CancellationToken ct = default)
            => Task.FromResult(new SearchResultSet(answer(query).ToList(), 0, query.Page, query.PageSize, 0));
        public Task<IReadOnlyList<SearchResultRow>> SearchTopAsync(
            string field, string query,
            IReadOnlyList<Guid> groupIds, IReadOnlyList<Guid> fileIds,
            IReadOnlyList<Guid>? allowedFileIds, int take, CancellationToken ct = default)
            => Task.FromResult(answer(new SearchQuery(
                query, "custom", field, groupIds, fileIds, allowedFileIds, 1, take, null, "asc")));
    }

    private static SearchResultRow Row(
        Guid id, string? fullName, string? nationalId, string? shamCash, string? personalNo,
        int rowIndex)
        => new(id, Guid.NewGuid(), "مجموعة", Guid.NewGuid(), "ملف العقود",
            fullName, nationalId, nationalId, null, shamCash, personalNo,
            null, null, null, null, null, null, null, null, null,
            "full_name", fullName, 0, rowIndex);

    private static byte[] WorkbookBytes(string sheet, string[] headers, params string[][] rows)
    {
        using var wb = new ClosedXML.Excel.XLWorkbook();
        var ws = wb.Worksheets.Add(sheet);
        for (var i = 0; i < headers.Length; i++) ws.Cell(1, i + 1).Value = headers[i];
        for (var r = 0; r < rows.Length; r++)
            for (var c = 0; c < headers.Length; c++)
                ws.Cell(r + 2, c + 1).Value = rows[r][c];
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static BulkSearchService Service(
        ISearchService search,
        out Microsoft.Extensions.Caching.Memory.IMemoryCache cache)
    {
        cache = new Microsoft.Extensions.Caching.Memory.MemoryCache(
            new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions { SizeLimit = 2048 });
        return new BulkSearchService(
            new BulkSearchFileStore(cache),
            new MergeWorkbookReader(),
            search);
    }

    [Fact]
    public async Task Run_RepeatsQueryPerHighMatch_AndExportsWorkbook()
    {
        var search = new FakeSearch(q => q.Query switch
        {
            "محمد حواصلي" => new List<SearchResultRow>
            {
                Row(Guid.NewGuid(), "محمد محمد شاكر حواصلي", "12345678912", "1234123412341234", "12345678912", 224),
            },
            "كريم زينو" => new List<SearchResultRow>
            {
                Row(Guid.NewGuid(), "كريم زينو عبد الرزاق", "12345678912", "1234123412341234", "12345678912", 445),
            },
            // Low-similarity candidate: filtered out by the high-match threshold.
            "سالم" => new List<SearchResultRow>
            {
                Row(Guid.NewGuid(), "أحمد خالد العلي", "999", "1", "2", 7),
            },
            _ => [],
        });
        var svc = Service(search, out var cache);
        try
        {
            var bytes = WorkbookBytes("ورقة1", ["الاسم"],
                ["محمد حواصلي"], ["كريم زينو"], ["محمد حواصلي"], ["غريب لا يوجد"], ["سالم"]);
            var inspection = svc.Inspect(bytes, "values.xlsx");
            Assert.Single(inspection.Sheets);
            Assert.Equal(["الاسم"], inspection.Selected.Headers);

            var result = await svc.RunAsync(
                new BulkSearchRunArgs(inspection.Token, "ورقة1", "full_name", 0),
                [], [], null);

            // Blank/dup handling: 4 distinct values (dup collapsed), 2 matched.
            Assert.Equal(4, result.TotalValues);
            Assert.Equal(2, result.MatchedValues);
            Assert.Equal(2, result.UnmatchedValues);
            Assert.Contains(result.UnmatchedQueries, u => u.Query == "غريب لا يوجد");
            Assert.Contains(result.UnmatchedQueries, u => u.Query == "سالم");
            // Unmatched values keep their sequence so the export lists all values in order.
            Assert.Equal([3, 4], result.UnmatchedQueries.Select(u => u.Sequence).OrderBy(s => s));
            Assert.Equal(2, result.TotalMatches);
            Assert.False(result.Truncated);
            Assert.Equal(1, result.Rows[0].Sequence);
            Assert.Equal("محمد حواصلي", result.Rows[0].QueryValue);
            Assert.Equal(224, result.Rows[0].RowIndex);
            Assert.Equal("محمد محمد شاكر حواصلي", result.Rows[0].FullName);
            Assert.Equal(100, result.Rows[0].MatchPercent);
            Assert.Equal(2, result.Rows[1].Sequence);
            Assert.Equal(445, result.Rows[1].RowIndex);

            var xlsx = BulkSearchExportBuilder.Build(result.Rows, result.Field);
            using var wb = new ClosedXML.Excel.XLWorkbook(new MemoryStream(xlsx));
            var ws = wb.Worksheets.Single(w => w.Name == BulkSearchExportBuilder.SheetName);
            Assert.Equal("التسلسل", ws.Cell(1, 1).GetString());
            Assert.Equal("نسبة التطابق", ws.Cell(1, 10).GetString());
            Assert.Equal("محمد حواصلي", ws.Cell(2, 2).GetString());
            Assert.Equal("100%", ws.Cell(2, 10).GetString());
            Assert.Equal(2, ws.Cell(3, 1).GetValue<int>());
            Assert.True(ws.LastRowUsed()!.RowNumber() == 3);
            Assert.StartsWith("البحث-الجماعي-نتائج-", BulkSearchExportBuilder.FileName());
        }
        finally
        {
            cache.Dispose();
        }
    }

    [Fact]
    public async Task Run_LargeValueCount_HasNoLimit()
    {
        var search = new FakeSearch(_ => new List<SearchResultRow>());
        var svc = Service(search, out var cache);
        try
        {
            var rows = Enumerable.Range(1, 1500).Select(i => new[] { $"قيمة {i}" }).ToArray();
            var bytes = WorkbookBytes("ورقة1", ["الاسم"], rows);
            var inspection = svc.Inspect(bytes, "large.xlsx");
            var result = await svc.RunAsync(
                new BulkSearchRunArgs(inspection.Token, "ورقة1", "full_name", 0),
                [], [], null);
            Assert.Equal(1500, result.TotalValues);
            Assert.Equal(0, result.TotalMatches);
            Assert.Equal(1500, result.UnmatchedValues);
            Assert.False(result.Truncated);
        }
        finally
        {
            cache.Dispose();
        }
    }

    [Fact]
    public async Task Run_SingleWordTextQuery_SkippedWithoutSearch()
    {
        var calls = 0;
        var search = new FakeSearch(q =>
        {
            calls++;
            return new List<SearchResultRow>();
        });
        var svc = Service(search, out var cache);
        try
        {
            var bytes = WorkbookBytes("ورقة1", ["الاسم"], ["محمد"], ["12345678912"]);
            var inspection = svc.Inspect(bytes, "general.xlsx");
            var result = await svc.RunAsync(
                new BulkSearchRunArgs(inspection.Token, "ورقة1", "full_name", 0),
                [], [], null);
            Assert.Equal(2, result.TotalValues);
            Assert.Equal(0, result.TotalMatches);
            // Only the digit fragment reached the database; "محمد" never did.
            Assert.Equal(1, calls);
            Assert.Contains(result.UnmatchedQueries, u => u.Query == "محمد");
        }
        finally
        {
            cache.Dispose();
        }
    }

    [Fact]
    public async Task Run_KeepsOnlyFirstTenMatchesPerValue()
    {
        var calls = 0;
        var all = Enumerable.Range(1, 25).Select(i =>
            Row(Guid.NewGuid(), $"كريم زينو عبد {i}", "11111111111", null, null, i)).ToList();
        var search = new FakeSearch(q =>
        {
            calls++;
            return all;
        });
        var svc = Service(search, out var cache);
        try
        {
            var bytes = WorkbookBytes("ورقة1", ["الاسم"], ["كريم زينو"]);
            var inspection = svc.Inspect(bytes, "top10.xlsx");
            var result = await svc.RunAsync(
                new BulkSearchRunArgs(inspection.Token, "ورقة1", "full_name", 0),
                [], [], null);
            Assert.Equal(10, result.TotalMatches);
            Assert.Equal(1, calls);
        }
        finally
        {
            cache.Dispose();
        }
    }

    [Fact]
    public async Task Run_CancelledToken_Throws()
    {
        var search = new FakeSearch(_ => new List<SearchResultRow>());
        var svc = Service(search, out var cache);
        try
        {
            var bytes = WorkbookBytes("ورقة1", ["الاسم"], ["كريم زينو"]);
            var inspection = svc.Inspect(bytes, "cancel.xlsx");
            using var cts = new CancellationTokenSource();
            cts.Cancel();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => svc.RunAsync(
                new BulkSearchRunArgs(inspection.Token, "ورقة1", "full_name", 0),
                [], [], null, null, cts.Token));
        }
        finally
        {
            cache.Dispose();
        }
    }

    [Fact]
    public async Task Run_EmptyColumn_Throws()
    {
        var search = new FakeSearch(_ => new List<SearchResultRow>());
        var svc = Service(search, out var cache);
        try
        {
            var bytes = WorkbookBytes("ورقة1", ["الاسم"], [""]);
            var inspection = svc.Inspect(bytes, "empty.xlsx");
            await Assert.ThrowsAsync<InvalidDataException>(() => svc.RunAsync(
                new BulkSearchRunArgs(inspection.Token, "ورقة1", "full_name", 0),
                [], [], null));
        }
        finally
        {
            cache.Dispose();
        }
    }
}
