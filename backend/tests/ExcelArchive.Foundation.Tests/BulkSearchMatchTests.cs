using ExcelArchive.Domain.Text;

namespace ExcelArchive.Foundation.Tests;

/// <summary>Bulk-search similarity contract: high-match threshold (80%).</summary>
public sealed class BulkSearchMatchTests
{
    [Fact]
    public void ExactName_IsHundred()
    {
        Assert.Equal(100, BulkSearchMatch.Percent("full_name", "محمد حواصلي", "محمد حواصلي"));
    }

    [Fact]
    public void QuerySubsetOfStoredName_IsHundred()
    {
        // Extra stored words are free: two written parts match a four-part name.
        Assert.Equal(100, BulkSearchMatch.Percent("full_name", "محمد حواصلي", "محمد محمد شاكر حواصلي"));
        Assert.Equal(100, BulkSearchMatch.Percent("full_name", "كريم زينو", "كريم زينو عبد الرزاق"));
    }

    [Fact]
    public void TypoWithinFifth_StaysHighMatch()
    {
        var percent = BulkSearchMatch.Percent("full_name", "محمد حواصلي", "محمد حواسلي");
        Assert.True(percent >= BulkSearchMatch.HighThreshold, $"expected >= 80, got {percent}");
        Assert.True(percent < 100);
    }

    [Fact]
    public void TotallyDifferentName_IsLow()
    {
        var percent = BulkSearchMatch.Percent("full_name", "محمد حواصلي", "أحمد خالد العلي");
        Assert.True(percent < BulkSearchMatch.HighThreshold, $"expected < 80, got {percent}");
    }

    [Fact]
    public void NumericExact_IsHundred()
    {
        Assert.Equal(100, BulkSearchMatch.Percent("national_id", "12345678912", "12345678912"));
    }

    [Fact]
    public void NumericShortFragment_IsNotHighMatch()
    {
        var percent = BulkSearchMatch.Percent("national_id", "12345", "12345678912");
        Assert.True(percent < BulkSearchMatch.HighThreshold, $"expected < 80, got {percent}");
    }

    [Fact]
    public void NumericMismatch_IsZero()
    {
        Assert.Equal(0, BulkSearchMatch.Percent("national_id", "999", "12345678912"));
    }

    [Fact]
    public void EmptyQuery_IsZero()
    {
        Assert.Equal(0, BulkSearchMatch.Percent("full_name", "   ", "محمد حواصلي"));
        Assert.False(BulkSearchMatch.IsHighMatch("full_name", "", "محمد حواصلي"));
    }

    [Fact]
    public void SupportedFields_CoverSearchCatalog()
    {
        foreach (var field in new[]
        {
            "first_name", "father_name", "last_name", "full_name", "national_id",
            "sham_cash", "personal_no", "mother_name", "phone", "contract_code",
            "secondary_contract_code", "job_title", "functional_category",
            "organizational_level",
        })
            Assert.True(BulkSearchMatch.IsSupportedField(field), field);
        Assert.False(BulkSearchMatch.IsSupportedField("nope"));
    }

    [Fact]
    public void TooGeneral_SingleWordText_IsTrue()
    {
        Assert.True(BulkSearchMatch.IsTooGeneral("full_name", "محمد"));
        Assert.True(BulkSearchMatch.IsTooGeneral("mother_name", "فاطمة"));
        Assert.False(BulkSearchMatch.IsTooGeneral("full_name", "محمد حواصلي"));
        // Lone digit fragments stay searchable; non-text fields are exact.
        Assert.False(BulkSearchMatch.IsTooGeneral("full_name", "84712"));
        Assert.False(BulkSearchMatch.IsTooGeneral("national_id", "123"));
    }

    [Fact]
    public void DistinctQueries_DedupesAndSkipsBlanks()
    {
        var queries = BulkSearchMatch.DistinctQueries(
            ["  محمد حواصلي ", "", "   ", "محمد حواصلي", "كريم زينو", new string('x', 201)]);
        Assert.Equal(["محمد حواصلي", "كريم زينو"], queries);
    }
}
