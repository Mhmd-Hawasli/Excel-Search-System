namespace ExcelArchive.Domain.Text;

/// <summary>Sham-cash helpers ported from V1 lib/format/sham-cash.ts (16 digits).</summary>
public static class ShamCash
{
    public const int Digits = 16;

    public static string? Normalize(object? value)
    {
        var digits = ArabicNormalizer.DigitsOnly(value);
        return digits.Length == Digits ? digits : null;
    }

    public static long? AsBigInt(object? value)
    {
        var normalized = Normalize(value);
        return normalized is null ? null : long.Parse(normalized);
    }

    public static string Format(object? value)
    {
        if (value is null) return "";
        var text = value.ToString() ?? "";
        if (text.Length == 0) return "";
        var digits = ArabicNormalizer.DigitsOnly(value);
        if (digits.Length == 0 || digits.Length > Digits) return text;
        return System.Text.RegularExpressions.Regex.Replace(
            digits.PadLeft(Digits, '0'), @"(\d{4})(?=\d)", "$1 ");
    }
}
