using System.Text;
using System.Text.RegularExpressions;

namespace ExcelArchive.Domain.Text;

/// <summary>
/// Full port of V1 lib/normalization/arabic.ts + lib/format/national-id.ts.
/// Frozen contract: changing this requires re-import + index rebuild.
/// </summary>
public static class ArabicNormalizer
{
    private static readonly Dictionary<char, char> DigitMap = new()
    {
        ['٠'] = '0', ['١'] = '1', ['٢'] = '2', ['٣'] = '3', ['٤'] = '4',
        ['٥'] = '5', ['٦'] = '6', ['٧'] = '7', ['٨'] = '8', ['٩'] = '9',
        ['۰'] = '0', ['۱'] = '1', ['۲'] = '2', ['۳'] = '3', ['۴'] = '4',
        ['۵'] = '5', ['۶'] = '6', ['۷'] = '7', ['۸'] = '8', ['۹'] = '9',
    };

    private static readonly Regex Diacritics = new(@"[ً-ٰٕ]", RegexOptions.Compiled);
    private static readonly Regex Whitespace = new(@"\s+", RegexOptions.Compiled);

    public static string ToLatinDigits(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        var sb = new StringBuilder(value.Length);
        foreach (var ch in value)
            sb.Append(DigitMap.TryGetValue(ch, out var d) ? d : ch);
        return sb.ToString();
    }

    /// <summary>Legacy entry point kept for callers: maps to NormalizeStored.</summary>
    public static string Normalize(string? value) => NormalizeStored(value);

    public static string NormalizeStored(object? value)
    {
        var text = value?.ToString() ?? "";
        text = ToLatinDigits(text.Trim());
        text = Whitespace.Replace(text, " ");
        text = Diacritics.Replace(text, "");
        text = text.Replace("ـ", "");
        text = Regex.Replace(text, "[أإآٱ]", "ا");
        text = text.Replace("ؤ", "و").Replace("ئ", "ي").Replace("ء", "");
        text = text.Replace("ة", "ه").Replace("ى", "ي");
        text = Regex.Replace(text, @"عبد\s+", "عبد");
        return text.ToLowerInvariant();
    }

    public static string StripDefiniteArticle(string token)
        => token.StartsWith("ال") && token.Length - 2 >= 3 ? token[2..] : token;

    public static IReadOnlyList<string> NormalizeQuery(object? value)
        => NormalizeStored(value).Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(StripDefiniteArticle).Where(t => t.Length > 0).ToList();

    public static string DigitsOnly(object? value)
    {
        var latin = ToLatinDigits(value?.ToString() ?? "");
        var sb = new StringBuilder(latin.Length);
        foreach (var c in latin) if (c >= '0' && c <= '9') sb.Append(c);
        return sb.ToString();
    }

    public static string? NationalIdDigits(object? value)
    {
        // V1 parity: remove ALL whitespace (JS /\s/), then require ASCII 0-9 only.
        var text = Whitespace.Replace(ToLatinDigits(value?.ToString() ?? ""), "");
        // JS \s does not strip NBSP-only? It does; also strip explicit NBSP/ZWSP guards.
        text = text.Replace("\u00A0", "").Replace("\uFEFF", "");
        if (text.Length == 0) return null;
        foreach (var c in text) if (c < '0' || c > '9') return null;
        var stripped = text.TrimStart('0');
        return stripped.Length == 0 ? "0" : stripped;
    }

    public static string NormalizeNationalId(object? value)
    {
        var digits = NationalIdDigits(value);
        return digits is null ? "" : digits.PadLeft(11, '0');
    }

    public static long? NationalIdAsBigInt(object? value)
    {
        var digits = NationalIdDigits(value);
        if (digits is null || digits.Length > 19) return null;
        if (!long.TryParse(digits, out var n)) return null;
        return n;
    }

    /// <summary>9–11 digits valid; ≤8 or ≥12 invalid. Returns null when valid.</summary>
    public static string? NationalIdIssue(object? value)
    {
        var text = value?.ToString() ?? "";
        if (string.IsNullOrWhiteSpace(text)) return "missing";
        var digits = NationalIdDigits(text);
        if (digits is null) return "characters";
        if (digits.Length <= 8) return "short";
        if (digits.Length >= 12) return "long";
        return null;
    }

    public static (long? SfNationalId, string? DNationalId, long? NationalIdNum) NationalIdColumns(object? value)
    {
        var num = NationalIdAsBigInt(value);
        var d = NormalizeNationalId(value);
        var issue = NationalIdIssue(value);
        return (num, string.IsNullOrEmpty(d) ? null : d, issue is null ? num : null);
    }

    public static bool MatchesNormalizedText(object? query, object? stored)
    {
        var norm = NormalizeStored(stored);
        var tokens = NormalizeQuery(query);
        return tokens.Count > 0 && tokens.All(t => norm.Contains(t, StringComparison.Ordinal));
    }

    public static bool MatchesNumeric(object? query, object? stored)
    {
        var needle = DigitsOnly(query);
        return needle.Length > 0 && DigitsOnly(stored).Contains(needle, StringComparison.Ordinal);
    }
}
