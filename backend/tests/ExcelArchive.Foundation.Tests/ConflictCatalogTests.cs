using ExcelArchive.Domain.Conflicts;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P4.1: frozen 58-rule catalog integrity, mirroring V1
/// catalog.test.ts intent in the .NET runtime.</summary>
public sealed class ConflictCatalogTests
{
    [Fact]
    public void Total_Is58_WithUniqueKeysAndLabels()
    {
        Assert.Equal(58, ConflictCatalog.Rules.Count);
        var keys = ConflictCatalog.Rules.Select(r => r.Key).ToList();
        Assert.Equal(keys.Count, keys.Distinct().Count());
        foreach (var rule in ConflictCatalog.Rules)
        {
            Assert.False(string.IsNullOrWhiteSpace(rule.Label));
            Assert.Contains(rule.Category, ConflictCatalog.Categories.Select(c => c.Key));
            Assert.Contains(rule.Field, ConflictCatalog.Fields.Select(f => f.Key));
        }
    }

    [Fact]
    public void CategoryBreakdown_Is11_9_2_36()
    {
        var byCat = ConflictCatalog.Rules.GroupBy(r => r.Category)
            .ToDictionary(g => g.Key, g => g.Count());
        Assert.Equal(11, byCat["invalid"]);
        Assert.Equal(9, byCat["missing"]);
        Assert.Equal(2, byCat["similar"]);
        Assert.Equal(36, byCat["conflicting"]);
    }

    [Fact]
    public void DirectedPairs_Are22_WithFilterFieldAsToSide()
    {
        var paired = ConflictCatalog.Rules.Where(r => r.PairFrom is not null).ToList();
        Assert.Equal(22, paired.Count);
        foreach (var rule in paired)
        {
            Assert.NotEqual(rule.PairFrom, rule.PairTo);
            Assert.Equal(rule.PairTo, rule.Field);
            Assert.Contains(rule.PairFrom!, ConflictCatalog.PairSides);
            Assert.Contains(rule.PairTo!, ConflictCatalog.PairSides);
        }
        var combos = paired.Select(r => $"{r.PairFrom}>{r.PairTo}").ToHashSet();
        Assert.Equal(22, combos.Count);
        // Every ordered pair of distinct sides exists exactly once, except the
        // 8 legacy-covered directions (national/sham/personal/contract/phone
        // ↔ person), mirroring the V1 catalog test.
        var legacy = new HashSet<string>
        {
            "national_id>person", "sham_cash>person", "personal_no>person",
            "contract_pair>person", "phone>person", "person>national_id",
            "person>sham_cash", "person>personal_no",
        };
        foreach (var from in ConflictCatalog.PairSides)
            foreach (var to in ConflictCatalog.PairSides)
            {
                if (from == to || legacy.Contains($"{from}>{to}")) continue;
                Assert.Contains($"{from}>{to}", combos);
            }
    }

    [Fact]
    public void SelectedRules_FiltersByCategoryFieldRule()
    {
        Assert.Equal(11, ConflictCatalog.SelectedRules("invalid", "all", "all").Count);
        Assert.Single(ConflictCatalog.SelectedRules("missing", "mother_name", "all"));
        Assert.Single(ConflictCatalog.SelectedRules("conflicting", "all", "duplicate_national"));
        Assert.Throws<InvalidOperationException>(() =>
            ConflictCatalog.SelectedRules("invalid", "phone", "all"));
    }
}
