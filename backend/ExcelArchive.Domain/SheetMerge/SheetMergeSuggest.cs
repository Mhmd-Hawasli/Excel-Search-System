using ExcelArchive.Domain.Text;

namespace ExcelArchive.Domain.SheetMerge;

/// <summary>
/// National-id column suggestion ported from V1 lib/sheet-merge/suggest.ts:
/// header aliases (exact 1 / contains 0.9 / bigram Dice, threshold 0.58)
/// combined with the share of sampled valid ids (header 0.65 + values 0.35).
/// </summary>
public static class SheetMergeSuggest
{
    private static readonly string[] Aliases =
    [
        "الرقم الوطني", "رقم وطني", "الرقم الوطنى", "الرقم القومي",
        "رقم قومي", "الرقم الوطني الموحد", "الرقم الوطني للشخص", "national id",
    ];

    private const double HeaderThreshold = 0.58;
    private const double ValueThreshold = 0.6;
    private const double HeaderWeight = 0.65;
    private const double ValueWeight = 0.35;

    private static HashSet<string> Bigrams(string value)
    {
        if (value.Length < 2) return [value];
        var set = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < value.Length - 1; i++)
            set.Add(value.Substring(i, 2));
        return set;
    }

    private static double Dice(string left, string right)
    {
        if (left == right) return 1;
        var a = Bigrams(left);
        var b = Bigrams(right);
        var overlap = a.Count(b.Contains);
        return 2.0 * overlap / (a.Count + b.Count == 0 ? 1 : a.Count + b.Count);
    }

    private static double HeaderScore(string header)
    {
        var normalized = ArabicNormalizer.NormalizeStored(header);
        if (normalized.Length == 0) return 0;
        var best = 0.0;
        foreach (var alias in Aliases)
        {
            var candidate = ArabicNormalizer.NormalizeStored(alias);
            var score = normalized == candidate ? 1
                : normalized.Contains(candidate, StringComparison.Ordinal)
                    || candidate.Contains(normalized, StringComparison.Ordinal) ? 0.9
                : Dice(normalized, candidate);
            if (score > best) best = score;
        }
        return best >= HeaderThreshold ? best : 0;
    }

    public static double IdValueRatio(IReadOnlyList<string?> column)
    {
        var filled = 0;
        var valid = 0;
        foreach (var value in column)
        {
            var text = value?.Trim() ?? "";
            if (text.Length == 0) continue;
            filled++;
            if (SheetMergeKey.ReadNationalId(text).Key is not null) valid++;
        }
        if (filled == 0) return 0;
        return (double)valid / filled;
    }

    public static NationalIdSuggestion Suggest(
        IReadOnlyList<string> headers, IReadOnlyList<IReadOnlyList<string>> sampleRows)
    {
        if (headers.Count == 0) return new NationalIdSuggestion(null, null);
        int? bestIndex = null;
        var bestScore = 0.0;
        string? bestReason = null;
        for (var index = 0; index < headers.Count; index++)
        {
            var headerPart = HeaderScore(headers[index]);
            var ratio = IdValueRatio(sampleRows.Select(r => index < r.Count ? r[index] : null).ToList());
            var valuePart = ratio >= ValueThreshold ? ratio : 0;
            var score = headerPart * HeaderWeight + valuePart * ValueWeight;
            if (score <= bestScore || score <= 0) continue;
            bestScore = score;
            bestIndex = index;
            var header = headers[index];
            bestReason = headerPart > 0 && valuePart > 0
                ? $"اقتراح تلقائي من عنوان العمود «{header}» ومن قيمه ({Math.Round(ratio * 100)}% أرقام وطنية صالحة)."
                : headerPart > 0
                    ? $"اقتراح تلقائي من عنوان العمود «{header}»."
                    : $"اقتراح تلقائي من قيم العمود: {Math.Round(ratio * 100)}% من القيم أرقام وطنية صالحة.";
        }
        return new NationalIdSuggestion(bestIndex, bestReason);
    }
}
