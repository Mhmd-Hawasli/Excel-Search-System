namespace ExcelArchive.Domain.Text;

/// <summary>
/// Bulk-search matching contract (البحث الجماعي).
/// A stored row is exported only when its similarity to the searched Excel
/// value reaches the high-match threshold (80%), mirroring the fuzzy
/// full-name rule (distance * 5 &lt;= length) used by the archive search.
/// </summary>
public static class BulkSearchMatch
{
    /// <summary>Minimum similarity percent for a match to be exported.</summary>
    public const int HighThreshold = 80;

    /// <summary>
    /// Minimum query tokens for a text reference field to qualify.
    /// A single written word (e.g. just "محمد") is too general to ever be a
    /// high match, so it is skipped without touching the database.
    /// </summary>
    public const int MinTextTokens = 2;

    /// <summary>Maximum exported matches kept per searched value (top-ranked first).</summary>
    public const int MaxMatchesPerValue = 10;

    /// <summary>
    /// Maximum distinct searched values per run. Without a cap, a sheet with
    /// e.g. 100k rows fires 100k archive SELECTs (8-way parallel) and melts
    /// the database. Runs above this must narrow their column first.
    /// </summary>
    public const int MaxValues = 2000;

    /// <summary>Maximum sequences accepted by the export endpoint (DoS cap).</summary>
    public const int MaxExportSequences = 20000;

    /// <summary>Maximum searched value length (mirrors the single-search limit).</summary>
    public const int MaxValueLength = 200;

    public static readonly IReadOnlyDictionary<string, string> FieldLabels =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["first_name"] = "الاسم",
            ["father_name"] = "اسم الأب",
            ["last_name"] = "النسبة",
            ["full_name"] = "الاسم الثلاثي",
            ["national_id"] = "الرقم الوطني",
            ["sham_cash"] = "الشام كاش",
            ["personal_no"] = "الرقم الذاتي",
            ["mother_name"] = "اسم الأم",
            ["phone"] = "رقم الهاتف",
            ["contract_code"] = "رمز العقد الأساسي",
            ["secondary_contract_code"] = "رمز العقد الثانوي",
            ["job_title"] = "المسمى الوظيفي",
            ["functional_category"] = "الفئة الوظيفية",
            ["organizational_level"] = "السوية التنظيمية الأساسية",
        };

    public static bool IsSupportedField(string? field)
        => field is not null && FieldLabels.ContainsKey(field);

    public static string LabelFor(string field)
        => FieldLabels.TryGetValue(field, out var label) ? label : field;

    public static string KindFor(string field) => field switch
    {
        "national_id" or "sham_cash" or "personal_no" or "phone" => "numeric",
        "functional_category" => "functional_category",
        _ => "text",
    };

    /// <summary>
    /// Similarity percent (0..100) between a searched Excel value and the
    /// stored archive value of the reference field.
    /// Text mirrors the V1 fuzzy rule: every query token pays the Levenshtein
    /// distance to its closest stored word; extra stored words are free, so an
    /// exact two-part query scores 100 against a longer stored name.
    /// Numeric compares digit sequences (exact = 100, otherwise proportional
    /// containment). Category is exact (100) or nothing (0).
    /// </summary>
    public static int Percent(string field, string? query, string? stored)
    {
        var kind = KindFor(field);
        if (kind == "functional_category")
        {
            var wanted = FunctionalCategory.Query(query);
            var actual = FunctionalCategory.Parse(stored);
            return wanted is not null && actual == wanted ? 100 : 0;
        }
        if (kind == "numeric")
            return NumericPercent(query, stored);
        return TextPercent(query, stored);
    }

    public static bool IsHighMatch(string field, string? query, string? stored)
        => Percent(field, query, stored) >= HighThreshold;

    /// <summary>
    /// True when a text query is too general for a high match: a lone word
    /// (e.g. just "محمد") matches thousands of rows without ever proving a
    /// high similarity. Lone digit strings (code fragments) stay searchable.
    /// </summary>
    public static bool IsTooGeneral(string field, string? query)
    {
        if (KindFor(field) != "text") return false;
        var tokens = ArabicNormalizer.NormalizeQuery(query);
        if (tokens.Count == 0) return true;
        if (tokens.Count >= MinTextTokens) return false;
        return tokens[0].Any(char.IsLetter);
    }

    /// <summary>
    /// Ordered distinct searched values from an Excel column: trims cells,
    /// skips blanks and over-long values (mirrors the single-search limit),
    /// dedupes identical values so each is searched once.
    /// </summary>
    public static List<string> DistinctQueries(IEnumerable<string?> cells)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var result = new List<string>();
        foreach (var cell in cells)
        {
            var value = (cell ?? "").Trim();
            if (value.Length == 0 || value.Length > MaxValueLength) continue;
            if (seen.Add(value)) result.Add(value);
        }
        return result;
    }

    private static int NumericPercent(string? query, string? stored)
    {
        var needle = ArabicNormalizer.DigitsOnly(query);
        var haystack = ArabicNormalizer.DigitsOnly(stored);
        if (needle.Length == 0 || haystack.Length == 0) return 0;
        if (haystack == needle) return 100;
        if (!haystack.Contains(needle, StringComparison.Ordinal)) return 0;
        // Partial containment scores proportionally; short fragments of a long
        // number stay below the high-match threshold (exact lookup behaviour).
        return (int)Math.Round(needle.Length * 100.0 / haystack.Length);
    }

    private static int TextPercent(string? query, string? stored)
    {
        var tokens = ArabicNormalizer.NormalizeQuery(query);
        if (tokens.Count == 0) return 0;
        var words = ArabicNormalizer.NormalizeStored(stored)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(ArabicNormalizer.StripDefiniteArticle)
            .Where(w => w.Length > 0)
            .ToList();
        if (words.Count == 0) return 0;
        var distance = 0;
        foreach (var token in tokens)
        {
            var best = words.Min(w => Levenshtein(w, token));
            distance += best;
        }
        var baseLength = string.Concat(tokens).EnumerateRunes().Count();
        if (baseLength == 0) return 0;
        var percent = (1 - (double)distance / baseLength) * 100;
        return (int)Math.Clamp(Math.Round(percent), 0, 100);
    }

    /// <summary>Code-point Levenshtein distance (insert/delete/substitute).</summary>
    public static int Levenshtein(string left, string right)
    {
        var a = left.EnumerateRunes().ToArray();
        var b = right.EnumerateRunes().ToArray();
        if (a.Length == 0) return b.Length;
        if (b.Length == 0) return a.Length;
        var previous = new int[b.Length + 1];
        for (var j = 0; j <= b.Length; j++) previous[j] = j;
        for (var i = 1; i <= a.Length; i++)
        {
            var current = new int[b.Length + 1];
            current[0] = i;
            for (var j = 1; j <= b.Length; j++)
                current[j] = Math.Min(
                    Math.Min(previous[j] + 1, current[j - 1] + 1),
                    previous[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1));
            previous = current;
        }
        return previous[b.Length];
    }
}
