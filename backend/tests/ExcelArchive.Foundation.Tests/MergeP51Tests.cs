using ExcelArchive.Application.DTOs.MergeDto;
using ExcelArchive.Domain.Merge;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P5.1: two-file six-rule ordered matching (strict + relaxed) + per-rule
/// results. Ports V1 lib/merge/rules.test.ts vectors (M01–M06).</summary>
public sealed class MergeP51Tests
{
    private static readonly string[] Headers =
    [
        "الاسم الثلاثي", "الاسم", "اسم الأب", "النسبة", "اسم الأم",
        "الرقم الوطني", "الرقم الذاتي", "الشام كاش", "رقم الهاتف",
    ];

    private static readonly MergeMapping Full = MergeMapping.From(new Dictionary<string, int>
    {
        ["fullName"] = 0, ["firstName"] = 1, ["fatherName"] = 2, ["lastName"] = 3,
        ["motherName"] = 4, ["nationalId"] = 5, ["personalNo"] = 6,
        ["shamCash"] = 7, ["phone"] = 8,
    });

    private static List<string> Cells(
        string? full = null, string? first = null, string? father = null,
        string? last = null, string? mother = null, string? national = null,
        string? personal = null, string? sham = null, string? phone = null)
    {
        var c = Enumerable.Repeat("", 9).ToList();
        if (full is not null) c[0] = full;
        if (first is not null) c[1] = first;
        if (father is not null) c[2] = father;
        if (last is not null) c[3] = last;
        if (mother is not null) c[4] = mother;
        if (national is not null) c[5] = national;
        if (personal is not null) c[6] = personal;
        if (sham is not null) c[7] = sham;
        if (phone is not null) c[8] = phone;
        return c;
    }

    private static MergeTableInput Table(params (int Row, List<string> Cells)[] rows)
        => new(Headers, rows.Select(r => new MergeRowInput(r.Row, r.Cells)).ToList(), Full);

    private static MergeTableInput TableWith(MergeMapping m, params (int Row, List<string> Cells)[] rows)
        => new(Headers, rows.Select(r => new MergeRowInput(r.Row, r.Cells)).ToList(), m);

    // M01: full_name strict
    [Fact]
    public void M01_FullName_LinksWhenMotherConfirms()
    {
        var r = MergeEngine.RunMerge(
            Table((2, Cells(full: "محمد أحمد على", mother: "فاطمة محمد"))),
            Table((2, Cells(full: "محمد أحمد علي", mother: "فاطمة شيخ"))));
        Assert.Single(r.Pairs);
        Assert.Equal("full_name", r.Pairs[0].Rule);
        Assert.True(r.Pairs[0].Confirmed);
        Assert.Equal("complete", r.Status.State);
    }

    [Fact]
    public void M01_FullName_NoLinkWhenMotherDiffers()
    {
        var r = MergeEngine.RunMerge(
            Table((2, Cells(full: "محمد أحمد على", mother: "فاطمة"))),
            Table((2, Cells(full: "محمد احمد علي", mother: "سليمة"))));
        Assert.Empty(r.Pairs);
        Assert.Equal("partial", r.Status.State);
    }

    [Fact]
    public void M01_FullName_SkipsAmbiguousNames()
    {
        var r = MergeEngine.RunMerge(
            Table(
                (2, Cells(full: "خالد سعيد", mother: "فاطمة")),
                (3, Cells(full: "خالد سعيد", mother: "سليمة"))),
            Table((2, Cells(full: "خالد سعيد", mother: "فاطمة"))));
        Assert.Empty(r.Pairs);
    }

    // M02: composed_name
    [Fact]
    public void M02_ComposedName_LinksPartsAgainstFull()
    {
        var leftMap = MergeMapping.From(new Dictionary<string, int>
        {
            ["firstName"] = 1, ["fatherName"] = 2, ["lastName"] = 3, ["motherName"] = 4,
        });
        var r = MergeEngine.RunMerge(
            TableWith(leftMap, (2, Cells(first: "محمد", father: "أحمد", last: "علي", mother: "فاطمة"))),
            Table((2, Cells(full: "محمد أحمد علي", mother: "فاطمة"))));
        Assert.Single(r.Pairs);
        Assert.Equal("composed_name", r.Pairs[0].Rule);
    }

    // M03: national_id strict + uniqueness + confirmation fallback
    [Fact]
    public void M03_NationalId_LinksWithFirstWordConfirmation()
    {
        var r = MergeEngine.RunMerge(
            Table((2, Cells(full: "محمد أحمد علي", national: "123456789"))),
            Table((2, Cells(full: "محمد خالد سعيد", national: "123456789"))));
        Assert.Single(r.Pairs);
        Assert.Equal("national_id", r.Pairs[0].Rule);
    }

    [Fact]
    public void M03_NationalId_NoLinkWithoutConfirmation()
    {
        var r = MergeEngine.RunMerge(
            Table((2, Cells(full: "محمد أحمد", national: "123456789"))),
            Table((2, Cells(full: "خالد سعيد", national: "123456789"))));
        Assert.Empty(r.Pairs);
    }

    [Fact]
    public void M03_NationalId_ArabicDigitsAndSpacesNormalized()
    {
        Assert.Equal("123456", MergeEngine.CanonicalNumeric("٠٠١٢٣٤٥٦"));
        Assert.Equal("937000000", MergeEngine.CanonicalNumeric("0937 000 000"));
        var r = MergeEngine.RunMerge(
            Table((2, Cells(full: "محمد أحمد", national: "٠٠١٢٣٤٥٦٧٨٩"))),
            Table((2, Cells(full: "محمد سعيد", national: "123456789"))));
        Assert.Single(r.Pairs);
    }

    // M04/M05/M06: numeric rules
    [Fact]
    public void M04_PersonalNo_LinksStrict()
    {
        var r = MergeEngine.RunMerge(
            Table((2, Cells(full: "محمد أحمد", personal: "777"))),
            Table((2, Cells(full: "محمد سعيد", personal: "777"))));
        Assert.Single(r.Pairs);
        Assert.Equal("personal_no", r.Pairs[0].Rule);
    }

    [Fact]
    public void M05_ShamCash_LinksStrict()
    {
        var r = MergeEngine.RunMerge(
            Table((2, Cells(full: "محمد أحمد", sham: "999"))),
            Table((2, Cells(full: "محمد سعيد", national: "111", sham: "999"))));
        // national differs so national_id cannot link; sham links with confirmation.
        Assert.Single(r.Pairs);
        Assert.Equal("sham_cash", r.Pairs[0].Rule);
    }

    [Fact]
    public void M06_Phone_LinksStrict()
    {
        var r = MergeEngine.RunMerge(
            Table((2, Cells(full: "محمد أحمد", phone: "0912345678"))),
            Table((2, Cells(full: "محمد سعيد", phone: "0912345678"))));
        Assert.Single(r.Pairs);
        Assert.Equal("phone", r.Pairs[0].Rule);
    }

    // Priority: rule order wins
    [Fact]
    public void Priority_FullNameBeatsNationalId()
    {
        var r = MergeEngine.RunMerge(
            Table((2, Cells(full: "محمد أحمد علي", mother: "فاطمة", national: "123"))),
            Table((2, Cells(full: "محمد أحمد علي", mother: "فاطمة", national: "123"))));
        Assert.Single(r.Pairs);
        Assert.Equal("full_name", r.Pairs[0].Rule);
    }

    // Relaxed: links single candidate without confirmation, keeps flag
    [Fact]
    public void Relaxed_LinksWithoutConfirmationAsUnconfirmed()
    {
        var left = Table((2, Cells(full: "محمد أحمد", national: "123456789")));
        var right = Table((2, Cells(full: "خالد سعيد", national: "123456789")));
        var strict = MergeEngine.RunMerge(left, right, requireConfirmation: true);
        Assert.Empty(strict.Pairs);
        var relaxed = MergeEngine.RunMerge(
            Table((2, Cells(full: "محمد أحمد", national: "123456789"))),
            Table((2, Cells(full: "خالد سعيد", national: "123456789"))),
            requireConfirmation: false);
        Assert.Single(relaxed.Pairs);
        Assert.False(relaxed.Pairs[0].Confirmed);
    }

    [Fact]
    public void Relaxed_StillRequiresUniquenessAndSingleCandidate()
    {
        var relaxed = MergeEngine.RunMerge(
            Table((2, Cells(full: "محمد أحمد", national: "123"))),
            Table(
                (2, Cells(full: "خالد سعيد", national: "123")),
                (3, Cells(full: "عمر زيد", national: "123"))),
            requireConfirmation: false);
        Assert.Empty(relaxed.Pairs);
    }

    // Per-rule stats + availability reasons
    [Fact]
    public void RuleStats_AvailableReasonWhenMappingMissing()
    {
        var noPhone = MergeMapping.From(new Dictionary<string, int> { ["fullName"] = 0 });
        var r = MergeEngine.RunMerge(
            TableWith(noPhone, (2, Cells(full: "محمد أحمد علي"))),
            TableWith(noPhone, (2, Cells(full: "محمد أحمد علي"))));
        var phone = r.Rules.First(s => s.Key == "phone");
        Assert.False(phone.Available);
        Assert.NotNull(phone.Reason);
        var full = r.Rules.First(s => s.Key == "full_name");
        Assert.True(full.Available);
        Assert.Equal(6, r.Rules.Count);
    }

    // Mapping validation
    [Fact]
    public void Mapping_DuplicateColumnRejected()
    {
        Assert.Throws<ArgumentException>(() => MergeMapping.From(
            new Dictionary<string, int> { ["fullName"] = 0, ["phone"] = 0 }));
    }

    [Fact]
    public void HasCommonRule_RequiresSharedField()
    {
        var a = MergeMapping.From(new Dictionary<string, int> { ["fullName"] = 0 });
        var b = MergeMapping.From(new Dictionary<string, int> { ["phone"] = 1 });
        Assert.False(MergeEngine.HasCommonRule(a, b));
        var c = MergeMapping.From(new Dictionary<string, int> { ["phone"] = 2 });
        Assert.True(MergeEngine.HasCommonRule(b, c));
    }

    // Suggest
    [Fact]
    public void Suggest_MapsArabicHeaders()
    {
        var m = MergeSuggest.Suggest(["الاسم الثلاثي", "اسم الأم", "الرقم الوطني", "ملاحظات"]);
        Assert.Equal(0, m.Field("fullName"));
        Assert.Equal(1, m.Field("motherName"));
        Assert.Equal(2, m.Field("nationalId"));
        Assert.Null(m.Field("phone"));
    }

    [Fact]
    public void NextKey_ContinuesSequence()
    {
        var r = MergeEngine.RunMerge(
            Table((2, Cells(full: "محمد أحمد علي", mother: "فاطمة"))),
            Table((2, Cells(full: "محمد أحمد علي", mother: "فاطمة"))));
        Assert.Equal(2, MergeEngine.NextKeyAfter([..r.Left, ..r.Right]));
    }

    // ---- Live service: real ClosedXML workbooks through file store ----

    private static ExcelArchive.Application.Services.MergeService LiveService(
        out Microsoft.Extensions.Caching.Memory.IMemoryCache cache)
    {
        cache = new Microsoft.Extensions.Caching.Memory.MemoryCache(
            new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions { SizeLimit = 2048 });
        return new ExcelArchive.Application.Services.MergeService(
            new ExcelArchive.Infrastructure.Implementations.Storage.MergeFileStore(cache),
            new ExcelArchive.Infrastructure.Implementations.Storage.MergeSessionStore(cache),
            new ExcelArchive.Infrastructure.Implementations.Storage.MergeExportStore(cache),
            new ExcelArchive.Infrastructure.Implementations.Excel.MergeWorkbookReader(),
            new ExcelArchive.Infrastructure.Implementations.Excel.MergeExportBuilderAdapter());
    }

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

    [Fact]
    public void Live_InspectRunDeleteKey()
    {
        var svc = LiveService(out var cache);
        try
        {
            var headers = new[] { "الاسم الثلاثي", "اسم الأم", "الرقم الوطني" };
            var leftBytes = WorkbookBytes("A", headers, ["محمد أحمد علي", "فاطمة", "123456789"]);
            var rightBytes = WorkbookBytes("B", headers, ["محمد أحمد علي", "فاطمة", "123456789"]);
            var left = svc.Inspect(leftBytes, "left.xlsx");
            var right = svc.Inspect(rightBytes, "right.xlsx");
            Assert.Equal(3, left.Selected.Headers.Count);
            Assert.Equal("الاسم الثلاثي", left.Selected.Headers[0]);
            Assert.True(left.SuggestedMapping.ContainsKey("fullName"));

            var sheet = svc.InspectSheet(left.Token, left.Selected.SheetName);
            Assert.Equal(left.Selected.Headers, sheet.Headers);

            var run = svc.Run(new ExcelArchive.Application.DTOs.MergeDto.MergeRunArgs(
                left.Token, left.Selected.SheetName,
                new Dictionary<string, int> { ["fullName"] = 0, ["motherName"] = 1, ["nationalId"] = 2 },
                right.Token, right.Selected.SheetName,
                new Dictionary<string, int> { ["fullName"] = 0, ["motherName"] = 1, ["nationalId"] = 2 },
                false));
            Assert.Single(run.Result.Pairs);
            Assert.Equal("full_name", run.Result.Pairs[0].Rule);

            // V1 parity: deleting the only pair frees both rows and the engine
            // immediately re-links them (same values still match). With no
            // remaining keys the sequence restarts at 0001 (nextKeyAfter).
            var (session, after) = svc.DeleteKey(run.SessionId, "left", 2);
            Assert.Single(after.Pairs);
            Assert.Equal("0001", after.Pairs[0].Key);
            Assert.Equal("full_name", after.Pairs[0].Rule);
        }
        finally
        {
            cache.Dispose();
        }
    }

    [Fact]
    public void Live_RunRejectsWithoutCommonRule()
    {
        var svc = LiveService(out var cache);
        try
        {
            var headers = new[] { "الاسم الثلاثي", "اسم الأم" };
            var a = svc.Inspect(WorkbookBytes("A", headers, ["محمد أحمد", "فاطمة"]), "a.xlsx");
            var b = svc.Inspect(WorkbookBytes("B", new[] { "رقم الهاتف" }, ["0912"]), "b.xlsx");
            Assert.Throws<InvalidOperationException>(() => svc.Run(
                new ExcelArchive.Application.DTOs.MergeDto.MergeRunArgs(
                    a.Token, a.Selected.SheetName, new Dictionary<string, int> { ["fullName"] = 0 },
                    b.Token, b.Selected.SheetName, new Dictionary<string, int> { ["phone"] = 0 },
                    false)));
        }
        finally
        {
            cache.Dispose();
        }
    }
}
