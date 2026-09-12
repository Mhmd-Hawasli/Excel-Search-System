using ExcelArchive.Domain.Merge;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P7.4: large-data proof deferred from P5.5 — the six-rule matcher
/// must not silently truncate. 55k unique national-id rows per side run
/// end-to-end in memory with every row present in the result.</summary>
public sealed class MergeP74ScaleTests
{
    [Fact]
    public void RunMerge_55kRows_NoSilentTruncation()
    {
        const int n = 55_000;
        var leftRows = new List<MergeRowInput>(n);
        var rightRows = new List<MergeRowInput>(n);
        for (var i = 0; i < n; i++)
        {
            // Unique 9-digit national id + first-word name confirmation.
            var nid = (100_000_000 + i).ToString();
            var name = $"اسم{i} أب{i} جد{i}";
            leftRows.Add(new MergeRowInput(i + 2, [$"L{name}", "أم", nid]));
            rightRows.Add(new MergeRowInput(i + 2, [$"L{name}", "أم", nid]));
        }
        var mapping = MergeMapping.From(new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["fullName"] = 0, ["motherName"] = 1, ["nationalId"] = 2,
        });
        var result = MergeEngine.RunMerge(
            new MergeTableInput(["الاسم", "الأم", "الوطني"], leftRows, mapping),
            new MergeTableInput(["الاسم", "الأم", "الوطني"], rightRows, mapping));

        Assert.Equal(n, result.Left.Count);
        Assert.Equal(n, result.Right.Count);
        Assert.Equal(n, result.Pairs.Count);
        Assert.Equal(n, result.Status.MatchedPairs);
        Assert.Equal("complete", result.Status.State);
    }
}
