using ExcelArchive.Application.Common.Conflicts;
using ExcelArchive.Application.DTOs.ConflictDto;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P4.1: validated conflicts request contract mirroring V1
/// request.ts + request.test.ts intent (defaults, bounds, cross-checks).
/// No database required.</summary>
public sealed class ConflictRequestTests
{
    [Fact]
    public void Defaults_MatchV1()
    {
        Assert.True(ConflictRequestValidator.TryParse(null, null, null, null, null, null, null, out var r));
        Assert.NotNull(r);
        Assert.Equal("invalid", r!.Category);
        Assert.Equal("all", r.Field);
        Assert.Equal("all", r.Rule);
        Assert.Equal(1, r.Page);
        Assert.Equal(25, r.PageSize);
        Assert.Equal("issueNumber", r.SortBy);
        Assert.Equal("asc", r.SortDir);
    }

    [Theory]
    [InlineData("nope", null, null)]
    [InlineData("invalid", "nope", null)]
    [InlineData("invalid", "all", "nope")]
    [InlineData("missing", "phone", "all")]
    [InlineData("invalid", "national_id", "missing_national")]
    public void IllegalCombinations_Rejected(string category, string? field, string? rule)
    {
        Assert.False(ConflictRequestValidator.TryParse(category, field, rule, null, null, null, null, out _));
    }

    [Theory]
    [InlineData("0")]
    [InlineData("1000001")]
    [InlineData("abc")]
    public void Page_OutOfRange_Rejected(string page)
    {
        Assert.False(ConflictRequestValidator.TryParse("invalid", "all", "all", page, null, null, null, out _));
    }

    [Theory]
    [InlineData("9")]
    [InlineData("101")]
    [InlineData("abc")]
    public void PageSize_OutOfRange_Rejected(string pageSize)
    {
        Assert.False(ConflictRequestValidator.TryParse("invalid", "all", "all", null, pageSize, null, null, out _));
    }

    [Theory]
    [InlineData("nope")]
    [InlineData("id")]
    public void SortBy_Unknown_Rejected(string sortBy)
    {
        Assert.False(ConflictRequestValidator.TryParse("invalid", "all", "all", null, null, sortBy, null, out _));
    }

    [Theory]
    [InlineData("up")]
    [InlineData("")]
    public void SortDir_Unknown_Rejected(string sortDir)
    {
        // Empty string falls back to the default; anything else must be asc/desc.
        if (sortDir == "")
        {
            Assert.True(ConflictRequestValidator.TryParse("invalid", "all", "all", null, null, null, sortDir, out var r));
            Assert.Equal("asc", r!.SortDir);
        }
        else
            Assert.False(ConflictRequestValidator.TryParse("invalid", "all", "all", null, null, null, sortDir, out _));
    }

    [Fact]
    public void ValidTriple_Accepted()
    {
        Assert.True(ConflictRequestValidator.TryParse(
            "conflicting", "phone", "pair_person_phone", "2", "50", "fullName", "desc", out var r));
        Assert.Equal("pair_person_phone", r!.Rule);
        Assert.Equal(2, r.Page);
        Assert.Equal("desc", r.SortDir);
    }
}
