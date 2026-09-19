using ClosedXML.Excel;
using ExcelArchive.Application.DTOs.MergeDto;
using ExcelArchive.Application.Services;
using ExcelArchive.Domain.Merge;
using ExcelArchive.Infrastructure.Implementations.Excel;
using ExcelArchive.Infrastructure.Implementations.Storage;

namespace ExcelArchive.Foundation.Tests;

/// <summary>Custom merge section: user rules (mandatory link + optional
/// confirm), cascade order, uniqueness, availability and validation.</summary>
public sealed class MergeCustomTests
{
    private static MergeTableInput Table(
        string[] headers, string[][] rows, Dictionary<string, int> mapping)
        => new(headers, rows.Select((r, i) => new MergeRowInput(i + 2, r)).ToList(),
            MergeMapping.From(mapping));

    private static List<CustomMergeRule> Rules(params CustomMergeSpec[] specs)
        => MergeEngine.BuildCustomRules(specs);

    [Fact]
    public void Validate_RejectsBadSpecs()
    {
        Assert.Throws<InvalidDataException>(() => MergeEngine.BuildCustomRules([]));
        Assert.Throws<InvalidDataException>(() =>
            MergeEngine.BuildCustomRules([new CustomMergeSpec("nope", null)]));
        Assert.Throws<InvalidDataException>(() =>
            MergeEngine.BuildCustomRules([new CustomMergeSpec("nationalId", "nationalId")]));
        Assert.Throws<InvalidDataException>(() =>
            MergeEngine.BuildCustomRules([new CustomMergeSpec("nationalId", "nope")]));
        Assert.Throws<InvalidDataException>(() => MergeEngine.BuildCustomRules(
            [new CustomMergeSpec("nationalId", "shamCash"), new CustomMergeSpec("nationalId", "shamCash")]));
        var many = Enumerable.Range(0, MergeEngine.MaxCustomRules + 1)
            .Select(i => new CustomMergeSpec("phone", null)).ToList();
        // Duplicates throw first; distinct over-limit specs throw the count error.
        Assert.Throws<InvalidDataException>(() => MergeEngine.BuildCustomRules(many));
    }

    [Fact]
    public void BuildKeys_StableAcrossReorder()
    {
        var a = Rules(new CustomMergeSpec("nationalId", "shamCash"))[0];
        var b = Rules(new CustomMergeSpec("shamCash", "nationalId"), new CustomMergeSpec("nationalId", "shamCash"))[1];
        Assert.Equal(a.Key, b.Key);
        Assert.StartsWith(MergeEngine.CustomKeyPrefix, a.Key);
        Assert.Contains("الرقم الوطني", a.Label);
        Assert.Contains("الشام كاش", a.Label);
    }

    [Fact]
    public void LinkWithConfirm_MatchesOnlyOnBothEqual()
    {
        var headers = new[] { "n", "s" };
        var map = new Dictionary<string, int> { ["nationalId"] = 0, ["shamCash"] = 1 };
        var left = Table(headers, [["111", "999"], ["222", "888"]], map);
        var right = Table(headers, [["111", "999"], ["222", "000"]], map);
        var result = MergeEngine.RunCustomMerge(left, right,
            Rules(new CustomMergeSpec("nationalId", "shamCash")));
        Assert.Single(result.Pairs);
        var pair = result.Pairs[0];
        Assert.True(pair.Confirmed);
        Assert.Equal(2, pair.LeftRowNumber);
        Assert.Equal(2, pair.RightRowNumber);
        Assert.Equal("custom:nationalId:shamCash", pair.Rule);
    }

    [Fact]
    public void LinkWithoutConfirm_StaysUnconfirmed()
    {
        var headers = new[] { "n" };
        var map = new Dictionary<string, int> { ["nationalId"] = 0 };
        var left = Table(headers, [["111"]], map);
        var right = Table(headers, [["111"]], map);
        var result = MergeEngine.RunCustomMerge(left, right,
            Rules(new CustomMergeSpec("nationalId", null)));
        var pair = Assert.Single(result.Pairs);
        Assert.False(pair.Confirmed);
    }

    [Fact]
    public void DuplicateLinkValue_NeverLinks()
    {
        var headers = new[] { "n", "s" };
        var map = new Dictionary<string, int> { ["nationalId"] = 0, ["shamCash"] = 1 };
        var left = Table(headers, [["111", "1"], ["111", "2"]], map);
        var right = Table(headers, [["111", "1"]], map);
        var result = MergeEngine.RunCustomMerge(left, right,
            Rules(new CustomMergeSpec("nationalId", "shamCash")));
        Assert.Empty(result.Pairs);
    }

    [Fact]
    public void Cascade_FirstRuleWins()
    {
        var headers = new[] { "n", "p" };
        var map = new Dictionary<string, int> { ["nationalId"] = 0, ["phone"] = 1 };
        var left = Table(headers, [["111", "555"]], map);
        var right = Table(headers, [["111", "555"]], map);
        var result = MergeEngine.RunCustomMerge(left, right, Rules(
            new CustomMergeSpec("nationalId", null),
            new CustomMergeSpec("phone", null)));
        var pair = Assert.Single(result.Pairs);
        Assert.Equal("custom:nationalId:-", pair.Rule);
        Assert.Equal(1, result.Rules[0].MatchedPairs);
        Assert.Equal(0, result.Rules[1].MatchedPairs);
    }

    [Fact]
    public void ComposedName_LinksFullAgainstParts()
    {
        // Left carries only the full name, right only the name parts:
        // composed falls back to full on the left and joins parts on the right.
        var left = Table(["الاسم"],
            [["محمد أحمد علي"]],
            new Dictionary<string, int> { ["fullName"] = 0 });
        var right = Table(["ا", "ب", "ن"],
            [["محمد", "أحمد", "علي"]],
            new Dictionary<string, int> { ["firstName"] = 0, ["fatherName"] = 1, ["lastName"] = 2 });
        var rules = Rules(new CustomMergeSpec("composedName", null));
        Assert.Equal("custom:composedName:-", rules[0].Key);
        Assert.Contains("تركيب الاسم الثلاثي", rules[0].Label);
        var result = MergeEngine.RunCustomMerge(left, right, rules);
        var pair = Assert.Single(result.Pairs);
        Assert.False(pair.Confirmed);
        Assert.True(MergeEngine.HasCommonCustomRule(
            MergeMapping.From(new Dictionary<string, int> { ["fullName"] = 0 }),
            MergeMapping.From(new Dictionary<string, int> { ["firstName"] = 0 }),
            rules));
    }

    [Fact]
    public void ComposedName_AsConfirmField()
    {
        var left = Table(["n", "f"],
            [["111", "محمد أحمد علي"]],
            new Dictionary<string, int> { ["nationalId"] = 0, ["fullName"] = 1 });
        var right = Table(["n", "a", "b", "c"],
            [["111", "محمد", "أحمد", "علي"]],
            new Dictionary<string, int> { ["nationalId"] = 0, ["firstName"] = 1, ["fatherName"] = 2, ["lastName"] = 3 });
        var result = MergeEngine.RunCustomMerge(left, right,
            Rules(new CustomMergeSpec("nationalId", "composedName")));
        var pair = Assert.Single(result.Pairs);
        Assert.True(pair.Confirmed);
    }

    [Fact]
    public void HasCommonCustomRule_RequiresMappedLinkBothSides()
    {
        var both = MergeMapping.From(new Dictionary<string, int> { ["nationalId"] = 0 });
        var none = MergeMapping.Empty;
        var rules = Rules(new CustomMergeSpec("nationalId", null));
        Assert.True(MergeEngine.HasCommonCustomRule(both, both, rules));
        Assert.False(MergeEngine.HasCommonCustomRule(both, none, rules));
    }

    [Fact]
    public void Stats_Unavailable_WhenLinkUnmapped()
    {
        var headers = new[] { "n" };
        var map = new Dictionary<string, int> { ["nationalId"] = 0 };
        var left = Table(headers, [["111"]], map);
        var right = Table(headers, [["111"]], map);
        var rules = Rules(new CustomMergeSpec("phone", "nationalId"));
        var result = MergeEngine.RunCustomMerge(left, right, rules);
        var stat = Assert.Single(result.Rules);
        Assert.False(stat.Available);
        Assert.NotNull(stat.Reason);
        Assert.Empty(result.Pairs);
    }

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

    [Fact]
    public void Service_CustomRun_ExportsAndRelinks()
    {
        var svc = LiveService(out var cache);
        try
        {
            var headers = new[] { "الوطني", "شام" };
            var left = svc.Inspect(WorkbookBytes("A", headers, ["111", "999"], ["222", "888"]), "l.xlsx");
            var right = svc.Inspect(WorkbookBytes("B", headers, ["111", "999"], ["333", "777"]), "r.xlsx");
            var mapping = new Dictionary<string, int> { ["nationalId"] = 0, ["shamCash"] = 1 };
            var run = svc.Run(new MergeRunArgs(
                left.Token, left.Selected.SheetName, mapping,
                right.Token, right.Selected.SheetName, mapping,
                false, null,
                [new CustomMergeSpec("nationalId", "shamCash")]));
            var pair = Assert.Single(run.Result.Pairs);
            Assert.True(pair.Confirmed);
            Assert.Equal("custom:nationalId:shamCash", pair.Rule);

            var (confirmed, _) = svc.ExportScoped(run.SessionId, "confirmed");
            Assert.True(confirmed.Length > 0);
            var (all, _) = svc.ExportScoped(run.SessionId, "all");
            Assert.True(all.Length >= confirmed.Length);

            // Delete-and-relink re-applies the same custom rules.
            var (_, relinked) = svc.DeleteKey(run.SessionId, "left", pair.LeftRowNumber);
            Assert.Single(relinked.Pairs);
        }
        finally { cache.Dispose(); }
    }

    [Fact]
    public void Service_CustomRun_RejectsWithoutCommonLink()
    {
        var svc = LiveService(out var cache);
        try
        {
            var headers = new[] { "الوطني" };
            var left = svc.Inspect(WorkbookBytes("A", headers, ["111"]), "l.xlsx");
            var right = svc.Inspect(WorkbookBytes("B", headers, ["111"]), "r.xlsx");
            var mapLeft = new Dictionary<string, int> { ["nationalId"] = 0 };
            var mapRight = new Dictionary<string, int> { ["phone"] = 0 };
            Assert.Throws<InvalidOperationException>(() => svc.Run(new MergeRunArgs(
                left.Token, left.Selected.SheetName, mapLeft,
                right.Token, right.Selected.SheetName, mapRight,
                false, null,
                [new CustomMergeSpec("nationalId", null)])));
        }
        finally { cache.Dispose(); }
    }
}
