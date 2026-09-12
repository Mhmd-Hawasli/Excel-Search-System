using System.Text.RegularExpressions;

namespace ExcelArchive.Domain.Text;

/// <summary>
/// Functional-category parser ported from V1 lib/format/functional-category.ts.
/// Frozen contract: stored numeric form 1..5, 0 = error/unknown, null = empty.
/// </summary>
public static class FunctionalCategory
{
    public const int Error = 0;

    public static readonly string[] Labels =
    [
        "فئة الأولى",
        "فئة الثانية",
        "فئة الثالثة",
        "فئة الرابعة",
        "فئة الخامسة",
    ];

    /// <summary>
    /// Converts any Arabic (or numeric) spelling into 1..5, 0 for unknown
    /// non-empty values, null for empty values. Mirrors V1 exactly, including
    /// the filler-word/article stripping order.
    /// </summary>
    public static int? Parse(object? value)
    {
        if (value is null) return null;
        var text = ArabicNormalizer.ToLatinDigits(value.ToString() ?? "").Trim();
        if (text.Length == 0) return null;

        var numeric = Regex.Match(text, @"^([0-9]+)(?:[.,][0-9]+)?$");
        if (numeric.Success)
        {
            var number = int.Parse(numeric.Groups[1].Value);
            return number is >= 1 and <= 5 ? number : Error;
        }

        var normalized = ArabicNormalizer.NormalizeStored(text).Replace("الفيه", " ").Replace("فيه", " ");
        var key = Regex.Replace(normalized, @"\s+", "").Trim();
        if (key.StartsWith("ال", StringComparison.Ordinal)) key = key[2..];
        key = key.Trim();
        if (key.Length == 0) return null;

        if (Regex.IsMatch(key, "^[0-9]+$"))
        {
            var number = int.Parse(key);
            return number is >= 1 and <= 5 ? number : Error;
        }

        if (key == "او" || key.StartsWith("اول", StringComparison.Ordinal)) return 1;
        if (key.StartsWith("ثان", StringComparison.Ordinal)) return 2;
        if (key == "لث" || key.StartsWith("ثالث", StringComparison.Ordinal) || key.StartsWith("ثلث", StringComparison.Ordinal)) return 3;
        if (key == "را" || key.StartsWith("رابع", StringComparison.Ordinal)) return 4;
        if (key == "مس" || key.StartsWith("خامس", StringComparison.Ordinal) || key.StartsWith("خمس", StringComparison.Ordinal)) return 5;
        return Error;
    }

    /// <summary>Display form of a stored category, mirroring V1.</summary>
    public static string Format(object? value)
    {
        if (value is null || string.IsNullOrWhiteSpace(value.ToString())) return "";
        var category = Parse(value);
        if (category is null) return "";
        if (category == Error) return "فئة غير معروفة";
        return Labels[category.Value - 1];
    }

    /// <summary>Search helper: numeric category or null when unrecognizable.</summary>
    public static int? Query(object? value)
    {
        var category = Parse(value);
        return category is not null && category != Error ? category : null;
    }
}
