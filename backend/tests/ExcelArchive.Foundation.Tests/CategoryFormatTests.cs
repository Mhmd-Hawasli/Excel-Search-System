using ExcelArchive.Domain.Text;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P2.2 functional-category + sham-cash ports. Vectors mirror V1
/// functional-category.test.ts exactly.</summary>
public sealed class CategoryFormatTests
{
    public static TheoryData<string, int> FirstSpellings => new()
    {
        { "1", 1 }, { "١", 1 }, { "01", 1 }, { "1.0", 1 },
        { "الفئة الأولى", 1 }, { "الفئة الاولى", 1 }, { "فئة الأولى", 1 },
        { "الأولى", 1 }, { "الاولى", 1 }, { "اولى", 1 }, { "أولى", 1 },
        { "اول", 1 }, { "او", 1 }, { "أو", 1 },
        { "ثان", 2 }, { "الثانية", 2 }, { "ثانية", 2 }, { "٢", 2 },
        { "لث", 3 }, { "الثالثة", 3 }, { "ثالث", 3 },
        { "را", 4 }, { "الرابعة", 4 }, { "رابعه", 4 },
        { "مس", 5 }, { "الخامسة", 5 }, { "خامسه", 5 }, { "٥", 5 },
        { "فئة ٣", 3 }, { "الفئة  4", 4 },
    };

    [Theory]
    [MemberData(nameof(FirstSpellings))]
    public void ParsesSpellings(string value, int expected)
        => Assert.Equal(expected, FunctionalCategory.Parse(value));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   \t ")]
    public void EmptyIsNull(object? value) => Assert.Null(FunctionalCategory.Parse(value));

    [Theory]
    [InlineData("سادسة")]
    [InlineData("خارج التصنيف")]
    [InlineData("9")]
    [InlineData("0")]
    public void UnknownIsZero(string value) => Assert.Equal(0, FunctionalCategory.Parse(value));

    [Fact]
    public void Formats()
    {
        Assert.Equal("فئة الأولى", FunctionalCategory.Format(1));
        Assert.Equal("فئة الثانية", FunctionalCategory.Format("ثانية"));
        Assert.Equal("فئة غير معروفة", FunctionalCategory.Format("سادسة"));
        Assert.Equal("", FunctionalCategory.Format(""));
        Assert.Equal("", FunctionalCategory.Format(null));
    }

    [Fact]
    public void Queries()
    {
        Assert.Equal(1, FunctionalCategory.Query("الفئة الأولى"));
        Assert.Equal(2, FunctionalCategory.Query("ثان"));
        Assert.Equal(5, FunctionalCategory.Query("5"));
        Assert.Null(FunctionalCategory.Query("أحمد 555"));
        Assert.Null(FunctionalCategory.Query(""));
    }

    [Fact]
    public void ShamCash_Rules()
    {
        Assert.Equal("1234567890123456", ShamCash.Normalize("1234567890123456"));
        Assert.Null(ShamCash.Normalize("123"));
        Assert.Equal(1234567890123456L, ShamCash.AsBigInt("1234567890123456"));
        Assert.Null(ShamCash.AsBigInt("abc"));
        Assert.Equal("", ShamCash.Format(null));
    }
}
