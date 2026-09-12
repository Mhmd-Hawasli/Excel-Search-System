using ExcelArchive.Domain.SheetMerge;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P5.3: sheet-merge key policy + multi-sheet engine (V1 vectors).</summary>
public sealed class SheetMergeP53Tests
{
    // ---- key ----

    [Fact]
    public void Key_LinksOnMoreThan7Digits()
    {
        Assert.Equal("123456789", SheetMergeKey.ReadNationalId("123456789").Key);
        Assert.Equal("123456789", SheetMergeKey.ReadNationalId(123456789).Key);
        Assert.Equal("123456789", SheetMergeKey.ReadNationalId("١٢٣٤٥٦٧٨٩").Key);
        Assert.Equal("123456789", SheetMergeKey.ReadNationalId(" ٠٠١٢٣ ٤٥٦\t٧٨٩ ").Key);
        Assert.Equal("1234567890", SheetMergeKey.ReadNationalId("1,234,567,890").Key);
        Assert.Equal("1234567890", SheetMergeKey.ReadNationalId("١٬٢٣٤٬٥٦٧٬٨٩٠").Key);
        Assert.Equal("12345678", SheetMergeKey.ReadNationalId("00012345678").Key);
        Assert.Equal("1234567890", SheetMergeKey.ReadNationalId("1.23456789E+9").Key);
    }

    [Fact]
    public void Key_AcceptsExactly8_Rejects7OrFewer()
    {
        Assert.Equal("12345678", SheetMergeKey.ReadNationalId("12345678").Key);
        var short7 = SheetMergeKey.ReadNationalId("1234567");
        Assert.Null(short7.Key);
        Assert.Equal("short", short7.Issue);
        Assert.Equal("1234567", short7.Digits);
        var shrunk = SheetMergeKey.ReadNationalId("01234567");
        Assert.Null(shrunk.Key);
        Assert.Equal("1234567", shrunk.Digits);
    }

    [Fact]
    public void Key_ReportsEmptyAndCharacters()
    {
        Assert.Equal("empty", SheetMergeKey.ReadNationalId("").Issue);
        Assert.Equal("empty", SheetMergeKey.ReadNationalId("   ").Issue);
        Assert.Equal("empty", SheetMergeKey.ReadNationalId(null).Issue);
        Assert.Equal("characters", SheetMergeKey.ReadNationalId("123abc").Issue);
        Assert.Equal("characters", SheetMergeKey.ReadNationalId("غير معروف").Issue);
        Assert.Equal("characters", SheetMergeKey.ReadNationalId("12345678.5").Issue);
    }

    [Fact]
    public void Key_ReasonsInArabic()
    {
        Assert.Contains("فارغ", SheetMergeKey.IssueReason("empty"));
        Assert.Contains("أحرف غير رقمية", SheetMergeKey.IssueReason("characters"));
        Assert.Contains("7 محارف", SheetMergeKey.IssueReason("short", "1234567"));
        Assert.Contains("الصف 12", SheetMergeKey.DuplicateReason(12));
        Assert.Contains("الأساسية", SheetMergeKey.MissingInMainReason("الأساسية"));
    }

    // ---- engine ----

    private static UploadedWorkbook Fixture()
    {
        UploadedSheet Sheet(string name, string[] headers, string[][] rows, bool filters = false)
            => new()
            {
                Name = name, Headers = headers.ToList(),
                Rows = rows.Select((cells, i) => new UploadedSheetRow
                {
                    RowNumber = i + 2, Cells = cells.ToList(),
                }).ToList(),
                FiltersRemoved = filters,
            };
        return new UploadedWorkbook
        {
            Id = Guid.NewGuid(), OriginalFilename = "الموظفون.xlsx",
            Sheets =
            [
                Sheet("الأساسية", ["الاسم", "الرقم الوطني", "المدينة"],
                [
                    ["أحمد", "123456789", "دمشق"],
                    ["ليلى", "٠٠٩٨٧٦٥٤٣٢١", "حلب"],
                    ["سامي", "123", "حمص"],
                    ["مروة", "123456789", "اللاذقية"],
                ]),
                Sheet("الرواتب", ["الرقم الوطني", "الراتب"],
                [
                    ["123456789", "5000"],
                    ["111222333", "7000"],
                    ["", "9000"],
                ], filters: true),
                Sheet("العناوين", ["الرقم الوطني", "العنوان", "الهاتف"],
                [
                    ["987654321", "شارع النيل", "0999"],
                ]),
            ],
        };
    }

    [Fact]
    public void Build_MainColumnsPlusLinkedWithoutId()
    {
        var built = SheetMergeEngine.Build(Fixture(), 1, ["الرواتب", "العناوين"]);
        Assert.Equal(["الاسم", "الرقم الوطني", "المدينة", "الراتب", "العنوان", "الهاتف"],
            built.GridHeaders);
        Assert.Equal(4, built.GridRows.Count);
        Assert.Equal(["أحمد", "123456789", "دمشق", "5000", "", ""], built.GridRows[0]);
        Assert.Equal(["ليلى", "٠٠٩٨٧٦٥٤٣٢١", "حلب", "", "شارع النيل", "0999"], built.GridRows[1]);
        Assert.Equal(["سامي", "123", "حمص", "", "", ""], built.GridRows[2]);
        Assert.Equal(["مروة", "123456789", "اللاذقية", "", "", ""], built.GridRows[3]);
        Assert.Equal(4, built.Stats.ExportRowCount);
    }

    [Fact]
    public void Build_StatsAndUnlinked()
    {
        var built = SheetMergeEngine.Build(Fixture(), 1, ["الرواتب", "العناوين"]);
        var main = built.Stats.Sheets[0];
        Assert.Equal("main", main.Role);
        Assert.Equal(4, main.RowCount);
        Assert.Equal(2, main.ValidKeyCount);
        Assert.Equal(1, main.InvalidCount);
        Assert.Equal(1, main.DuplicateCount);
        Assert.Equal(2, main.LinkedCount);
        Assert.Equal(50, main.Percent);
        Assert.Equal(2, main.UnlinkedTotal);
        Assert.Equal([4, 5], main.Unlinked.Select(r => r.RowNumber).ToList());
        Assert.Contains("7 محارف", main.Unlinked[0].Reason);
        Assert.Contains("مكرر", main.Unlinked[1].Reason);

        var salaries = built.Stats.Sheets[1];
        Assert.Equal("linked", salaries.Role);
        Assert.Equal(3, salaries.RowCount);
        Assert.Equal(1, salaries.LinkedCount);
        Assert.Equal(33.3, salaries.Percent);
        Assert.Equal(1, salaries.InvalidCount);
        Assert.Equal(1, salaries.MissingCount);
        Assert.Equal(["الراتب"], salaries.Headers);
        Assert.Equal(50, built.Stats.LinkPercent);

        var addresses = built.Stats.Sheets[2];
        Assert.Equal(1, addresses.LinkedCount);
        Assert.Equal(100, addresses.Percent);
        Assert.Equal(0, addresses.UnlinkedTotal);
    }

    [Fact]
    public void Build_WorkbookOrderRegardlessOfSelection()
    {
        var built = SheetMergeEngine.Build(Fixture(), 1, ["العناوين", "الرواتب"]);
        Assert.Equal(["الأساسية", "الرواتب", "العناوين"],
            built.Stats.Sheets.Select(s => s.SheetName).ToList());
        Assert.Equal(["الراتب", "العنوان", "الهاتف"], built.GridHeaders.Skip(3).ToList());
    }

    [Fact]
    public void Build_UnlinkedSheetsForExport()
    {
        var built = SheetMergeEngine.Build(Fixture(), 1, ["الرواتب", "العناوين"]);
        Assert.Equal(["الأساسية", "الرواتب"],
            built.UnlinkedSheets.Select(s => s.SheetName).ToList());
    }

    [Fact]
    public void Build_RejectsInvalidConfiguration()
    {
        Assert.Throws<InvalidDataException>(
            () => SheetMergeEngine.Build(Fixture(), 9, ["الرواتب"]));
        Assert.Throws<InvalidDataException>(
            () => SheetMergeEngine.Build(Fixture(), 1, []));
        Assert.Throws<InvalidDataException>(
            () => SheetMergeEngine.Build(Fixture(), 1, ["غير موجودة"]));
        var withSingle = Fixture();
        withSingle.Sheets.Add(new UploadedSheet
        {
            Name = "فارغة", Headers = ["الرقم الوطني"],
            Rows = [new UploadedSheetRow { RowNumber = 2, Cells = ["123456789"] }],
        });
        Assert.Throws<InvalidDataException>(
            () => SheetMergeEngine.ResolveLinkedSheets(withSingle, ["فارغة"]));
    }

    [Fact]
    public void Build_ReportsProgress()
    {
        var events = new List<(int, string?)>();
        SheetMergeEngine.Build(Fixture(), 1, ["الرواتب", "العناوين"],
            (percent, detail) => events.Add((percent, detail)));
        Assert.True(events.Count >= 5);
        Assert.Equal(98, events[^1].Item1);
        Assert.Contains(events, e => e.Item2 != null && e.Item2.Contains("الرواتب"));
    }

    [Fact]
    public void Build_FullUnlinkedKeptBeyondPreview()
    {
        var uploaded = Fixture();
        var main = uploaded.Sheets[0];
        for (var i = 0; i < 350; i++)
            main.Rows.Add(new UploadedSheetRow
            {
                RowNumber = 100 + i, Cells = ["س", "1", "م"],
            });
        var built = SheetMergeEngine.Build(uploaded, 1, ["الرواتب"]);
        var stat = built.Stats.Sheets[0];
        Assert.Equal(352, stat.UnlinkedTotal);
        Assert.Equal(300, stat.Unlinked.Count);
        var sheet = built.UnlinkedSheets.First(s => s.SheetName == "الأساسية");
        Assert.Equal(352, sheet.Rows.Count);
    }

    // ---- service: upload → run → export → download ----

    private static ExcelArchive.Application.Services.SheetMergeService LiveService(
        out Microsoft.Extensions.Caching.Memory.IMemoryCache cache)
    {
        cache = new Microsoft.Extensions.Caching.Memory.MemoryCache(
            new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions { SizeLimit = 2048 });
        return new ExcelArchive.Application.Services.SheetMergeService(
            new ExcelArchive.Infrastructure.Implementations.Storage.SheetMergeStore(cache),
            new ExcelArchive.Infrastructure.Implementations.Excel.SheetMergeParser(),
            new ExcelArchive.Infrastructure.Implementations.Excel.SheetMergeExportBuilderAdapter());
    }

    private static byte[] TwoSheetBytes()
    {
        using var wb = new ClosedXML.Excel.XLWorkbook();
        var main = wb.Worksheets.Add("الأساسية");
        foreach (var (h, i) in new[] { "الاسم", "الرقم الوطني", "المدينة" }.Select((h, i) => (h, i)))
            main.Cell(1, i + 1).Value = h;
        main.Cell(2, 1).Value = "أحمد"; main.Cell(2, 2).Value = "123456789"; main.Cell(2, 3).Value = "دمشق";
        main.Cell(2, 1).Style.Fill.PatternType = ClosedXML.Excel.XLFillPatternValues.Solid;
        main.Cell(2, 1).Style.Fill.BackgroundColor = ClosedXML.Excel.XLColor.FromHtml("#FF0000");
        main.Cell(3, 1).Value = "سامي"; main.Cell(3, 2).Value = "123"; main.Cell(3, 3).Value = "حمص";
        var linked = wb.Worksheets.Add("الرواتب");
        linked.Cell(1, 1).Value = "الرقم الوطني"; linked.Cell(1, 2).Value = "الراتب";
        linked.Cell(2, 1).Value = "123456789"; linked.Cell(2, 2).Value = "5000";
        linked.Cell(3, 1).Value = "000000000"; linked.Cell(3, 2).Value = "7000";
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    [Fact]
    public async Task Live_UploadRunExportDownload()
    {
        var svc = LiveService(out var cache);
        try
        {
            var up = await svc.UploadAsync(TwoSheetBytes(), "w.xlsx");
            Assert.Equal(2, up.SheetCount);
            Assert.Equal("الأساسية", up.Main.Name);
            Assert.Equal(1, up.Suggestion.Index);

            await Assert.ThrowsAsync<KeyNotFoundException>(
                () => svc.RunAsync(Guid.NewGuid(), 1, ["الرواتب"]));
            var run = await svc.RunAsync(up.UploadId, 1, ["الرواتب"]);
            Assert.Equal(2, run.Sheets.Count);
            Assert.Equal(1, run.Sheets[1].LinkedCount);

            var ready = await svc.PrepareExportAsync(run.SessionId);
            Assert.EndsWith(".xlsx", ready.Filename);
            Assert.Equal(3, ready.SheetCount);
            var (bytes, filename, size) = svc.Download(ready.DownloadId);
            Assert.Equal(ready.Filename, filename);
            Assert.Equal(bytes.Length, size);
            using var wb = new ClosedXML.Excel.XLWorkbook(new MemoryStream(bytes));
            Assert.Equal(3, wb.Worksheets.Count);
            Assert.Equal("الدمج", wb.Worksheets.First().Name);
            // Source fill survives on the merged row.
            var fill = wb.Worksheets.First().Cell(2, 1).Style.Fill.BackgroundColor;
            Assert.Equal("FFFF0000", fill.ToString());
            // Unlinked sheets carry every unlinked row (main سامي + linked zeros).
            var unlinked = wb.Worksheets.Skip(1).ToList();
            Assert.All(unlinked, ws => Assert.StartsWith("غير مرتبط", ws.Name));
            Assert.Equal(2, unlinked.Sum(ws => ws.LastRowUsed()!.RowNumber() - 1));
            Assert.Throws<KeyNotFoundException>(() => svc.Download(Guid.NewGuid()));
        }
        finally
        {
            cache.Dispose();
        }
    }

    [Fact]
    public async Task Live_UploadRejectsSingleSheet()
    {
        var svc = LiveService(out var cache);
        try
        {
            using var wb = new ClosedXML.Excel.XLWorkbook();
            wb.Worksheets.Add("وحيدة").Cell(1, 1).Value = "x";
            using var ms = new MemoryStream();
            wb.SaveAs(ms);
            await Assert.ThrowsAsync<InvalidDataException>(
                () => svc.UploadAsync(ms.ToArray(), "one.xlsx"));
        }
        finally
        {
            cache.Dispose();
        }
    }

    // ---- suggest ----

    [Fact]
    public void Suggest_FindsNationalColumn()
    {
        var s = SheetMergeSuggest.Suggest(
            ["الاسم", "الرقم الوطني", "ملاحظات"],
            [["أحمد", "123456789", "x"], ["سارة", "987654321", "y"]]);
        Assert.Equal(1, s.Index);
        Assert.NotNull(s.Reason);
        var none = SheetMergeSuggest.Suggest(["الاسم", "المدينة"], [["أحمد", "دمشق"]]);
        Assert.Null(none.Index);
    }
}
