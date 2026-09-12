using ExcelArchive.Domain.Text;

namespace ExcelArchive.Foundation.Tests;

/// <summary>
/// P1.3 golden normalization tests. Vectors mirror V1
/// src/lib/normalization/arabic.test.ts (docs/07.3). Frozen contract.
/// </summary>
public sealed class NormalizationTests
{
    public static TheoryData<string, string> MandatoryPairs => new()
    {
        { "احمد", "أحمد" },
        { "احمد", "إحمد" },
        { "احمد", "آحمد" },
        { "فاطمه", "فاطمة" },
        { "فاطمة", "فاطمه" },
        { "مصطفي", "مصطفى" },
        { "يحيى", "يحيي" },
        { "عبدالله", "عبد الله" },
        { "عبد الله", "عبدالله" },
        { "قاسم", "القاسم" },
        { "القاسم", "قاسم" },
        { "احمد محمد", "أحمد علي محمد" },
        { "الله", "عبدالله" },
        { "مُحَمَّــد", "محمد" },
    };

    [Theory]
    [MemberData(nameof(MandatoryPairs))]
    public void MandatoryPair_Matches(string query, string stored)
        => Assert.True(ArabicNormalizer.MatchesNormalizedText(query, stored),
            $"query '{query}' should match stored '{stored}'");

    [Fact]
    public void MatchesNumeric_Substring() => Assert.True(ArabicNormalizer.MatchesNumeric("555", "123555123"));

    [Fact]
    public void ConvertsArabicIndicDigits() => Assert.Equal("0123", ArabicNormalizer.NormalizeStored("٠١٢٣"));

    [Fact]
    public void AppliesStorageTransformsInOrder()
        => Assert.Equal("عبدالهام abc 123", ArabicNormalizer.NormalizeStored("  عَبْد   إلهــام  ABC ۱۲٣ "));

    [Fact]
    public void StripsDefiniteArticleOnlyWhenThreeCharsRemain()
        => Assert.Equal(new[] { "قاسم", "الله" }, ArabicNormalizer.NormalizeQuery("القاسم الله"));

    [Fact]
    public void ExtractsAndPadsNationalIds()
    {
        Assert.Equal("123", ArabicNormalizer.DigitsOnly(" ١٢-۳ "));
        Assert.Equal("00000000123", ArabicNormalizer.NormalizeNationalId("123"));
        Assert.Equal(123L, ArabicNormalizer.NationalIdAsBigInt("00000000123"));
        Assert.Equal(123456789012L, ArabicNormalizer.NationalIdAsBigInt("123456789012"));
    }

    public static TheoryData<object?, string?> NationalIssues => new()
    {
        { "", "missing" },
        { "   ", "missing" },
        { null, "missing" },
        { "abc", "characters" },
        { "12a34", "characters" },
        { "12345678", "short" },
        { "123456789012", "long" },
        { "123456789", null },
        { "12345678901", null },
        { "١٢٣٤٥٦٧٨٩", null },
    };

    [Theory]
    [MemberData(nameof(NationalIssues))]
    public void NationalIdIssue_Classifies(object? value, string? expected)
        => Assert.Equal(expected, ArabicNormalizer.NationalIdIssue(value));

    [Fact]
    public void NationalIdColumns_OnlyValidIdentityPopulatesNum()
    {
        var valid = ArabicNormalizer.NationalIdColumns("123456789");
        Assert.Equal(123456789L, valid.SfNationalId);
        Assert.Equal("00123456789", valid.DNationalId);
        Assert.Equal(123456789L, valid.NationalIdNum);

        var invalid = ArabicNormalizer.NationalIdColumns("123");
        Assert.Equal(123L, invalid.SfNationalId);
        Assert.Equal("00000000123", invalid.DNationalId);
        Assert.Null(invalid.NationalIdNum);
    }

    [Fact]
    public void EmptyQuery_NeverMatches()
        => Assert.False(ArabicNormalizer.MatchesNormalizedText("", "احمد"));
}
