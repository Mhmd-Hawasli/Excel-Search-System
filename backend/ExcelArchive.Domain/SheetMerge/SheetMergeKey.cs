using ExcelArchive.Domain.Text;

namespace ExcelArchive.Domain.SheetMerge;

/// <summary>
/// Link-key rule ported from V1 lib/sheet-merge/key.ts: the national id of
/// every sheet is read from the cell, converted to a number, and must exceed
/// 7 characters (≥8 digits after dropping leading zeros).
/// </summary>
public static class SheetMergeKey
{
    private static readonly char[] Separators =
    [
        ' ', '\t', '\n', '\r', '\f', '\v', '\u00A0',
        '\u2007', '\u2009', '\u202F', ',', '\u066C', '\u066B',
    ];

    private static readonly HashSet<char> SeparatorSet = new(Separators);

    public sealed record Reading(string? Key, string? Issue, string Digits);

    public static Reading ReadNationalId(object? value)
    {
        var text = ArabicNormalizer.ToLatinDigits(value?.ToString() ?? "");
        var sb = new System.Text.StringBuilder(text.Length);
        foreach (var c in text)
            if (!SeparatorSet.Contains(c))
                sb.Append(c);
        var cleaned = sb.ToString();
        if (cleaned.Length == 0) return new Reading(null, "empty", "");

        var digitsText = cleaned;
        if (!IsAllDigits(digitsText))
        {
            if (!double.TryParse(digitsText,
                    System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out var parsed)
                || double.IsNaN(parsed) || double.IsInfinity(parsed)
                || parsed < 0 || parsed != Math.Truncate(parsed) || parsed > 9e18)
                return new Reading(null, "characters", "");
            digitsText = ((long)parsed).ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        var digits = digitsText.TrimStart('0');
        if (digits.Length == 0) digits = "0";
        if (digits.Length < SheetMergeLimits.MinNationalIdDigits)
            return new Reading(null, "short", digits);
        return new Reading(digits, null, digits);
    }

    private static bool IsAllDigits(string s)
    {
        if (s.Length == 0) return false;
        foreach (var c in s)
            if (c < '0' || c > '9')
                return false;
        return true;
    }

    public static string IssueReason(string issue, string digits = "")
    {
        if (issue == "empty") return "الرقم الوطني فارغ.";
        if (issue == "characters") return "القيمة تحتوي على أحرف غير رقمية.";
        return $"الرقم {digits} طوله {digits.Length} محارف — يجب أن يكون أكثر من {SheetMergeLimits.MinNationalIdDigits - 1} محارف.";
    }

    public static string DuplicateReason(int firstRowNumber)
        => $"الرقم الوطني مكرر مع الصف {firstRowNumber} — يجب ألا يتكرر داخل الصفحة.";

    public static string MissingInMainReason(string mainSheetName)
        => $"الرقم الوطني غير موجود في الصفحة الرئيسية «{mainSheetName}».";
}
