using System.Text.RegularExpressions;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Domain.Conflicts;

/// <summary>
/// Port of V1 src/lib/format/date.ts parseStoredDate + query.ts date CTEs.
/// westernDigits → dmy (D/M/YYYY) → ymd (YYYY-M-D + optional time) →
/// English weekday/month → validDateParts (UTC midnight). Null = invalid.
/// </summary>
public static class ConflictDateParser
{
    private static readonly Dictionary<string, int> Months = new(StringComparer.Ordinal)
    {
        ["Jan"] = 1, ["Feb"] = 2, ["Mar"] = 3, ["Apr"] = 4,
        ["May"] = 5, ["Jun"] = 6, ["Jul"] = 7, ["Aug"] = 8,
        ["Sep"] = 9, ["Oct"] = 10, ["Nov"] = 11, ["Dec"] = 12,
    };

    private static readonly Regex Dmy = new(@"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$", RegexOptions.Compiled);
    private static readonly Regex Ymd = new(@"^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$", RegexOptions.Compiled);
    private static readonly Regex Excel =
        new(@"^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})\b",
            RegexOptions.Compiled);

    public static DateTime? ParseStoredDate(string? value)
    {
        if (value is null) return null;
        var normalized = ArabicNormalizer.ToLatinDigits(value.Trim());
        if (normalized.Length == 0) return null;

        var m = Dmy.Match(normalized);
        if (m.Success)
            return ValidDate(int.Parse(m.Groups[3].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[1].Value));

        m = Ymd.Match(normalized);
        if (m.Success)
            return ValidDate(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value));

        m = Excel.Match(normalized);
        if (m.Success)
            return ValidDate(int.Parse(m.Groups[4].Value), Months[m.Groups[1].Value], int.Parse(m.Groups[3].Value));

        return null;
    }

    private static DateTime? ValidDate(int year, int month, int day)
    {
        if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31)
            return null;
        try
        {
            var d = new DateTime(year, month, day, 0, 0, 0, DateTimeKind.Utc);
            return d.Year == year && d.Month == month && d.Day == day ? d : null;
        }
        catch { return null; }
    }
}
