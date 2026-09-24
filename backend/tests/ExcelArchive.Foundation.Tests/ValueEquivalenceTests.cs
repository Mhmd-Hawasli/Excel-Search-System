using ExcelArchive.Domain.Text;

namespace ExcelArchive.Foundation.Tests;

/// <summary>Replace-diff equivalence: same logical value in different Excel
/// formatting must NOT count as a change (leading zeros, US date order,
/// spacing, Arabic orthography variants and invisible controls).</summary>
public sealed class ValueEquivalenceTests
{
    public static TheoryData<string, string> SamePairs => new()
    {
        { "أحمد", "أحمد" },
        { "", "" },
    };

    public static TheoryData<string, string> FormattingOnlyPairs => new()
    {
        // Leading zeros dropped by Excel numeric cells.
        { "04170056420", "4170056420" },
        { "09", "9" },
        { "05050144887", "5050144887" },
        // Arabic-Indic digits.
        { "٤١٧٠٠٥٦٤٢٠", "4170056420" },
        // Same date, Syrian day/month vs Excel US month/day order.
        { "09/02/1995", "9/2/1995" },
        { "13/08/2024", "8/13/2024" },
        { "08/09/1968", "9/8/1968" },
        { "01/01/1986", "1/1/1986" },
        // Spacing / orthography noise (search-normalized equal).
        { "جامعة  حمص", "جامعة حمص" },
        { "  جيد ", "جيد" },
        { "أحمد", "احمد" },
        { "مُحَمَّد", "محمد" },
        // Invisible controls Excel injects (bidi marks around RTL emails,
        // zero-width spaces, BOM): identical display, different bytes.
        { "test" + (char)0x200E + "@gmail.com", "test@gmail.com" },
        { "test@gmail.com" + (char)0x200F, "test@gmail.com" },
        { "gh" + (char)0x200B + "san@gmail.com", "ghsan@gmail.com" },
        { "test" + (char)0xFEFF + "@gmail.com", "test@gmail.com" },
    };

    public static TheoryData<string, string> DifferentPairs => new()
    {
        { "أحمد", "سارة" },
        { "111", "999" },
        { "04170056420", "04170056421" },
        { "13/08/2024", "14/08/2024" },
        { "", "أحمد" },
        { "جامعة حمص", "جامعة دمشق" },
        { "a@gmail.com", "a@outlook.com" },
    };

    [Theory]
    [MemberData(nameof(SamePairs))]
    public void Same_ByteIdentical(string current, string next)
        => Assert.Equal(ValueEquivalence.Verdict.Same, ValueEquivalence.Compare(current, next));

    [Theory]
    [MemberData(nameof(FormattingOnlyPairs))]
    public void FormattingOnly_SameLogicalValue(string current, string next)
    {
        Assert.Equal(ValueEquivalence.Verdict.FormattingOnly, ValueEquivalence.Compare(current, next));
        Assert.True(ValueEquivalence.AreEquivalent(current, next));
    }

    [Theory]
    [MemberData(nameof(DifferentPairs))]
    public void Different_RealChange(string current, string next)
    {
        Assert.Equal(ValueEquivalence.Verdict.Different, ValueEquivalence.Compare(current, next));
        Assert.False(ValueEquivalence.AreEquivalent(current, next));
    }
}
