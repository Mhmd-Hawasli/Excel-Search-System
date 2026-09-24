using System.Globalization;
using System.Text;

namespace ExcelArchive.Domain.Text;

/// <summary>
/// Cell-value equivalence for replace preview and replace audit.
/// Excel re-exports the SAME logical value with different bytes (dropped leading
/// zeros, US month/day order, extra spaces, Arabic orthography variants), and a
/// naive ordinal compare flags tens of thousands of phantom "changes".
/// <list type="bullet">
/// <item><see cref="Verdict.Same"/> — byte-identical.</item>
/// <item><see cref="Verdict.FormattingOnly"/> — same logical value in a different
/// format (search-normalized equal, numerically equal, or same calendar day).
/// Not counted as a change and not written to the audit log.</item>
/// <item><see cref="Verdict.Different"/> — a real value change.</item>
/// </list>
/// Date semantics are day-precision (the archive stores administrative dates, not
/// timestamps). Both sides are parsed with the same ordered format list (Syrian
/// day/month first, then US month/day, then ISO/dotted); the pair is date-equal
/// when ANY interpretation agrees, because the archive stores Syrian day/month
/// order while Excel exports US month/day order — cross-locale agreement is
/// therefore required (e.g. "13/08/2024" and "8/13/2024" are the same day).
/// </summary>
public static class ValueEquivalence
{
    public enum Verdict { Same, FormattingOnly, Different }

    public static Verdict Compare(string? current, string? next)
    {
        var cv = current ?? "";
        var nv = next ?? "";
        if (string.Equals(cv, nv, StringComparison.Ordinal)) return Verdict.Same;
        // Invisible control characters (bidi marks Excel injects around emails
        // in RTL sheets, zero-width spaces, BOM...): strip before every check.
        // Done here — never inside NormalizeStored, whose contract is frozen.
        var cs = StripInvisible(cv);
        var ns = StripInvisible(nv);
        if (string.Equals(cs, ns, StringComparison.Ordinal)) return Verdict.FormattingOnly;
        if (string.Equals(
                ArabicNormalizer.NormalizeStored(cs),
                ArabicNormalizer.NormalizeStored(ns),
                StringComparison.Ordinal))
            return Verdict.FormattingOnly;
        if (TryNumericEqual(cs, ns)) return Verdict.FormattingOnly;
        if (TryDateEqual(cs, ns)) return Verdict.FormattingOnly;
        return Verdict.Different;
    }

    public static bool AreEquivalent(string? current, string? next)
        => Compare(current, next) != Verdict.Different;

    /// <summary>Removes invisible formatting characters: Unicode Format (Cf) —
    /// zero-width spaces/joiners, LTR/RTL marks and isolates, BOM, soft hyphen —
    /// plus stray control characters (keeping tab/newline for normalization).
    /// These never constitute a real value change.</summary>
    public static string StripInvisible(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        StringBuilder? sb = null;
        for (var i = 0; i < value.Length; i++)
        {
            var ch = value[i];
            var cat = char.GetUnicodeCategory(ch);
            var invisible = cat == UnicodeCategory.Format
                || (cat == UnicodeCategory.Control && ch != '\t' && ch != '\n' && ch != '\r');
            if (!invisible)
            {
                sb?.Append(ch);
                continue;
            }
            sb ??= new StringBuilder(value, 0, i, value.Length);
        }
        return sb?.ToString() ?? value;
    }

    private static bool TryParseNumber(string value, out decimal number)
    {
        number = 0;
        // Strip every whitespace kind (spaces, NBSP, tabs) then Latin digits.
        var noWhite = new string((value ?? "").Where(c => !char.IsWhiteSpace(c)).ToArray());
        var text = ArabicNormalizer.ToLatinDigits(noWhite);
        if (text.EndsWith("%")) text = text[..^1];
        text = text.Replace(",", "").Replace("،", "");
        if (text.Length == 0 || text.Length > 30) return false;
        return decimal.TryParse(text,
            NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
            CultureInfo.InvariantCulture, out number);
    }

    private static bool TryNumericEqual(string a, string b)
        => TryParseNumber(a, out var x) && TryParseNumber(b, out var y) && x == y;

    private static readonly string[] DateFormats =
    [
        "d/M/yyyy", "dd/MM/yyyy", "d-M-yyyy", "dd-MM-yyyy", "d.M.yyyy", "dd.MM.yyyy",
        "M/d/yyyy", "MM/dd/yyyy", "M-d-yyyy", "MM-d-yyyy", "M.d.yyyy", "MM.dd.yyyy",
        "d/M/yy", "dd/MM/yy", "M/d/yy", "MM/dd/yy",
        "yyyy-M-d", "yyyy/M/d", "yyyy.M.d",
        "d/M/yyyy H:mm", "d/M/yyyy H:mm:ss", "dd/MM/yyyy H:mm", "dd/MM/yyyy H:mm:ss",
        "M/d/yyyy H:mm", "M/d/yyyy H:mm:ss", "M/d/yyyy h:mm tt", "M/d/yyyy h:mm:ss tt",
        "yyyy-M-d H:mm", "yyyy-M-d H:mm:ss",
    ];

    /// <summary>All calendar days the text could denote under any supported
    /// interpretation (day/month and month/day orders, ISO, Excel serial).</summary>
    public static HashSet<DateOnly> DateCandidates(string? value)
    {
        var set = new HashSet<DateOnly>();
        var text = ArabicNormalizer.ToLatinDigits(value ?? "").Trim();
        if (text.Length == 0 || text.Length > 64) return set;
        // Excel serial day number (e.g. a date column read as a raw number).
        if (text.All(char.IsDigit)
            && long.TryParse(text, out var serial) && serial >= 20000 && serial <= 60000)
            set.Add(DateOnly.FromDateTime(new DateTime(1899, 12, 30).AddDays(serial)));
        foreach (var format in DateFormats)
            if (DateTime.TryParseExact(text, format, CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var dt))
                set.Add(DateOnly.FromDateTime(dt));
        return set;
    }

    private static bool TryDateEqual(string a, string b)
    {
        var ca = DateCandidates(a);
        if (ca.Count == 0) return false;
        var cb = DateCandidates(b);
        if (cb.Count == 0) return false;
        return ca.Overlaps(cb);
    }
}
