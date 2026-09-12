using ExcelArchive.Domain.Text;

namespace ExcelArchive.Domain.Merge;

/// <summary>
/// Automatic column suggestions for the two-file merge section.
/// Port of V1 lib/merge/suggest.ts (client-safe scoring).
/// </summary>
public static class MergeSuggest
{
    private static readonly IReadOnlyDictionary<string, string[]> Aliases =
        new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["fullName"] = ["الاسم الثلاثي", "الاسم الكامل", "اسم الشخص"],
            ["firstName"] = ["الاسم", "اسم"],
            ["fatherName"] = ["اسم الاب", "الاب", "اسم الوالد"],
            ["lastName"] = ["النسبه", "الكنيه", "اللقب"],
            ["motherName"] = ["اسم الام", "الام", "اسم الوالده", "اسم وكنيه الام", "كنيه الام"],
            ["nationalId"] = ["الرقم الوطني", "رقم وطني", "الرقم الوطنى", "الرقم القومي"],
            ["personalNo"] = ["الرقم الذاتي", "رقم ذاتي", "الرقم الوظيفي"],
            ["shamCash"] = ["الشام كاش", "شام كاش", "رقم شام كاش", "رقم حساب شام كاش"],
            ["phone"] = ["رقم الهاتف", "الهاتف", "الموبايل", "الجوال", "رقم الموبايل"],
        };

    private const double Threshold = 0.58;
    private static readonly string[] PartFields = ["firstName", "fatherName", "lastName"];

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

    private static double FieldScore(string field, string normalizedHeader)
    {
        var best = 0.0;
        foreach (var alias in Aliases[field])
        {
            var candidate = ArabicNormalizer.NormalizeStored(alias);
            if (candidate.Length == 0 || normalizedHeader.Length == 0) continue;
            var score = normalizedHeader == candidate ? 1
                : normalizedHeader.Contains(candidate, StringComparison.Ordinal)
                    || candidate.Contains(normalizedHeader, StringComparison.Ordinal) ? 0.9
                : Dice(normalizedHeader, candidate);
            if (score > best) best = score;
        }
        return best;
    }

    public static MergeMapping Suggest(IReadOnlyList<string> headers)
    {
        var normalized = headers.Select(ArabicNormalizer.NormalizeStored).ToList();
        var candidates = new List<(string Field, int Index, double Score)>();
        foreach (var field in MergeFields.Keys)
            for (var i = 0; i < normalized.Count; i++)
            {
                var score = FieldScore(field, normalized[i]);
                if (score >= Threshold) candidates.Add((field, i, score));
            }
        candidates.Sort((a, b) => b.Score.CompareTo(a.Score));

        var fields = new Dictionary<string, int>(StringComparer.Ordinal);
        var scores = new Dictionary<string, double>(StringComparer.Ordinal);
        var used = new HashSet<int>();
        foreach (var c in candidates)
        {
            if (fields.ContainsKey(c.Field) || used.Contains(c.Index)) continue;
            fields[c.Field] = c.Index;
            scores[c.Field] = c.Score;
            used.Add(c.Index);
        }

        if (fields.ContainsKey("fullName") && PartFields.Any(fields.ContainsKey))
        {
            var fullScore = scores.TryGetValue("fullName", out var fs) ? fs : 0;
            var partsScore = PartFields.Max(f => scores.TryGetValue(f, out var s) ? s : 0);
            if (fullScore >= partsScore)
            {
                foreach (var f in PartFields) fields.Remove(f);
            }
            else
            {
                fields.Remove("fullName");
            }
        }
        return MergeMapping.From(fields);
    }
}
