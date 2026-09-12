using ExcelArchive.Domain.Text;

namespace ExcelArchive.Domain.Merge;

/// <summary>
/// Pure two-file merge rule engine. Port of V1 lib/merge/rules.ts.
/// No database, no files, no session state — fully unit-testable.
/// Cascade: full_name → composed_name → national_id → personal_no →
/// sham_cash → phone. Uniqueness (COUNTIF=1) + confirmation per V1.
/// </summary>
public static class MergeEngine
{
    public static string CanonicalText(object? value)
        => ArabicNormalizer.NormalizeStored(value);

    public static string CanonicalNumeric(object? value)
    {
        var digits = ArabicNormalizer.DigitsOnly(value);
        if (digits.Length == 0) return "";
        var stripped = digits.TrimStart('0');
        return stripped.Length == 0 ? "0" : stripped;
    }

    public static string FirstWord(object? value)
    {
        var norm = CanonicalText(value);
        foreach (var part in norm.Split([' ', '\t', '\n', '\r'],
                     StringSplitOptions.RemoveEmptyEntries))
            return part;
        return "";
    }

    private sealed record Link(string Key, string Display);

    private sealed class PreparedRow
    {
        public required MergeRow Row { get; init; }
        public required Link Full { get; init; }
        public required Link Composed { get; init; }
        public required Dictionary<string, Link> Numeric { get; init; }
        public required string MotherWord { get; init; }
        public required string FullWord { get; init; }
    }

    private static string Cell(MergeRow row, int? index)
    {
        if (index is null) return "";
        return index.Value >= 0 && index.Value < row.Cells.Count
            ? row.Cells[index.Value] ?? ""
            : "";
    }

    private static string Trimmed(string value)
        => System.Text.RegularExpressions.Regex.Replace(value.Trim(), @"\s+", " ");

    private static Link TextLink(string value)
    {
        var display = Trimmed(value);
        return new Link(CanonicalText(display), display);
    }

    private static Link NumericLink(string value)
    {
        var display = Trimmed(value);
        return new Link(CanonicalNumeric(display), display);
    }

    private static PreparedRow Prepare(MergeRow row, MergeMapping mapping)
    {
        var full = TextLink(Cell(row, mapping.Field("fullName")));
        var first = TextLink(Cell(row, mapping.Field("firstName")));
        var parts = new[] { "firstName", "fatherName", "lastName" }
            .Select(f => Trimmed(Cell(row, mapping.Field(f))))
            .Where(s => s.Length > 0);
        var composed = TextLink(string.Join(" ", parts));
        var confirmSource = full.Key.Length > 0 ? full.Key : first.Key;
        var fullWord = "";
        foreach (var part in confirmSource.Split([' ', '\t', '\n', '\r'],
                     StringSplitOptions.RemoveEmptyEntries))
        {
            fullWord = part;
            break;
        }
        return new PreparedRow
        {
            Row = row,
            Full = full,
            Composed = composed,
            Numeric = new Dictionary<string, Link>(StringComparer.Ordinal)
            {
                ["national_id"] = NumericLink(Cell(row, mapping.Field("nationalId"))),
                ["personal_no"] = NumericLink(Cell(row, mapping.Field("personalNo"))),
                ["sham_cash"] = NumericLink(Cell(row, mapping.Field("shamCash"))),
                ["phone"] = NumericLink(Cell(row, mapping.Field("phone"))),
            },
            MotherWord = FirstWord(Cell(row, mapping.Field("motherName"))),
            FullWord = fullWord,
        };
    }

    private static Link LinkFor(MergeRules.Definition rule, PreparedRow p)
    {
        if (rule.Key == "full_name") return p.Full;
        if (rule.Key == "composed_name")
            return p.Composed.Key.Length > 0 ? p.Composed : p.Full;
        return p.Numeric[rule.Key];
    }

    private static string ConfirmFor(MergeRules.Definition rule, PreparedRow p)
        => rule.Key is "full_name" or "composed_name" ? p.MotherWord : p.FullWord;

    private static HashSet<string> AmbiguousLinks(
        IReadOnlyList<PreparedRow> rows, MergeRules.Definition rule)
    {
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var p in rows)
        {
            var link = LinkFor(rule, p);
            if (link.Key.Length == 0) continue;
            counts[link.Key] = counts.TryGetValue(link.Key, out var c) ? c + 1 : 1;
        }
        var ambiguous = new HashSet<string>(StringComparer.Ordinal);
        foreach (var kv in counts)
            if (kv.Value > 1) ambiguous.Add(kv.Key);
        return ambiguous;
    }

    public static (List<MatchPair> Pairs, int NextKey) ApplyRules(
        List<MergeRow> left, List<MergeRow> right,
        MergeMapping leftMapping, MergeMapping rightMapping,
        int startKey, bool requireConfirmation = true,
        Action<string, int, int>? onRuleDone = null)
    {
        var counter = startKey;
        var pairs = new List<MatchPair>();
        var preparedLeft = left.Select(r => Prepare(r, leftMapping)).ToList();
        var preparedRight = right.Select(r => Prepare(r, rightMapping)).ToList();

        void LinkPair(MergeRules.Definition rule, PreparedRow a, PreparedRow chosen, bool confirmed)
        {
            var key = counter.ToString().PadLeft(4, '0');
            counter++;
            a.Row.Key = key;
            a.Row.Rule = rule.Key;
            a.Row.Confirmed = confirmed;
            chosen.Row.Key = key;
            chosen.Row.Rule = rule.Key;
            chosen.Row.Confirmed = confirmed;
            pairs.Add(new MatchPair(key, rule.Key, a.Row.RowNumber, chosen.Row.RowNumber,
                confirmed, LinkFor(rule, a).Display, LinkFor(rule, chosen).Display));
        }

        for (var ruleIndex = 0; ruleIndex < MergeRules.All.Count; ruleIndex++)
        {
            var rule = MergeRules.All[ruleIndex];
            var ambiguousLeft = AmbiguousLinks(preparedLeft, rule);
            var ambiguousRight = AmbiguousLinks(preparedRight, rule);
            var rightByLink = new Dictionary<string, List<PreparedRow>>(StringComparer.Ordinal);
            foreach (var b in preparedRight)
            {
                var bLink = LinkFor(rule, b);
                if (bLink.Key.Length == 0) continue;
                if (!rightByLink.TryGetValue(bLink.Key, out var bucket))
                {
                    bucket = [];
                    rightByLink[bLink.Key] = bucket;
                }
                bucket.Add(b);
            }

            foreach (var a in preparedLeft)
            {
                if (a.Row.Key is not null) continue;
                var aLink = LinkFor(rule, a);
                if (aLink.Key.Length == 0) continue;
                if (ambiguousLeft.Contains(aLink.Key) || ambiguousRight.Contains(aLink.Key))
                    continue;
                var candidates = rightByLink.TryGetValue(aLink.Key, out var bucket)
                    ? bucket.Where(b => b.Row.Key is null).ToList()
                    : [];
                if (candidates.Count == 0) continue;

                var aConfirm = ConfirmFor(rule, a);
                PreparedRow? chosen = null;
                var confirmed = false;
                if (requireConfirmation)
                {
                    if (aConfirm.Length > 0)
                    {
                        var exact = candidates.Where(b => ConfirmFor(rule, b) == aConfirm).ToList();
                        if (exact.Count == 1) chosen = exact[0];
                        else if (exact.Count == 0)
                        {
                            var loose = candidates.Where(b => ConfirmFor(rule, b).Length == 0).ToList();
                            if (loose.Count == 1) chosen = loose[0];
                        }
                    }
                    else if (candidates.Count == 1)
                    {
                        chosen = candidates[0];
                    }
                    if (chosen is null) continue;
                    confirmed = aConfirm.Length > 0 && ConfirmFor(rule, chosen) == aConfirm;
                    if (!confirmed) continue;
                }
                else
                {
                    if (candidates.Count != 1) continue;
                    chosen = candidates[0];
                    confirmed = aConfirm.Length > 0 && ConfirmFor(rule, chosen) == aConfirm;
                }
                LinkPair(rule, a, chosen, confirmed);
            }
            onRuleDone?.Invoke(rule.Key, ruleIndex, MergeRules.All.Count);
        }
        return (pairs, counter);
    }

    private static string FieldLabel(string field)
        => MergeFields.Labels.TryGetValue(field, out var l) ? l : field;

    private static string? AvailabilityReason(
        MergeRules.Definition rule,
        IReadOnlyList<PreparedRow> left, IReadOnlyList<PreparedRow> right,
        MergeMapping leftMapping, MergeMapping rightMapping)
    {
        string? Missing(MergeMapping mapping, string side, bool linkable)
        {
            if (rule.Key == "composed_name")
            {
                if (mapping.Field("fullName") is null &&
                    mapping.Field("firstName") is null &&
                    mapping.Field("fatherName") is null &&
                    mapping.Field("lastName") is null)
                    return $"لا يوجد عمود «{FieldLabel("fullName")}» أو أعمدة الاسم واسم الأب والنسبة في الجدول {side}.";
            }
            else if (mapping.Field(rule.Required[0]) is null)
            {
                return $"لا يوجد عمود «{FieldLabel(rule.Required[0])}» في الجدول {side}.";
            }
            return linkable ? null : $"لا توجد قيم كافية في الجدول {side} لاستخدام القاعدة.";
        }

        var leftLinkable = left.Any(r => LinkFor(rule, r).Key.Length > 0);
        var rightLinkable = right.Any(r => LinkFor(rule, r).Key.Length > 0);
        return Missing(leftMapping, "الأول", leftLinkable)
            ?? Missing(rightMapping, "الثاني", rightLinkable);
    }

    private static List<RuleStat> BuildRuleStats(
        List<MergeRow> left, List<MergeRow> right,
        MergeMapping leftMapping, MergeMapping rightMapping)
    {
        var pl = left.Select(r => Prepare(r, leftMapping)).ToList();
        var pr = right.Select(r => Prepare(r, rightMapping)).ToList();
        return MergeRules.All.Select(rule => new RuleStat(
            rule.Key, rule.Order, rule.Label, rule.Description,
            AvailabilityReason(rule, pl, pr, leftMapping, rightMapping) is null,
            AvailabilityReason(rule, pl, pr, leftMapping, rightMapping),
            0, [])).ToList();
    }

    private static List<RuleStat> StatsWithPairs(List<RuleStat> stats, List<MatchPair> pairs)
    {
        foreach (var s in stats)
        {
            s.Pairs.AddRange(pairs.Where(p => p.Rule == s.Key));
        }
        return stats.Select(s => s with { MatchedPairs = s.Pairs.Count }).ToList();
    }

    public static MergeStatus Status(int leftCount, int rightCount, int pairCount)
    {
        var total = Math.Min(leftCount, rightCount);
        var percent = total == 0 ? 0 : Math.Round(pairCount / (double)total * 1000) / 10;
        var complete = total > 0 && pairCount >= total;
        return new MergeStatus(complete ? "complete" : "partial", pairCount, total, percent);
    }

    public static MergeResult RunMerge(
        MergeTableInput left, MergeTableInput right,
        int startKey = 1, bool requireConfirmation = true,
        Action<string, int, int>? onRuleDone = null)
    {
        var leftRows = left.Rows.Select(r => new MergeRow
        {
            RowNumber = r.RowNumber,
            Cells = r.Cells.ToList(),
            Key = null,
            Rule = null,
            Confirmed = false,
        }).ToList();
        var rightRows = right.Rows.Select(r => new MergeRow
        {
            RowNumber = r.RowNumber,
            Cells = r.Cells.ToList(),
            Key = null,
            Rule = null,
            Confirmed = false,
        }).ToList();
        var (pairs, _) = ApplyRules(leftRows, rightRows, left.Mapping, right.Mapping,
            startKey, requireConfirmation, onRuleDone);
        return new MergeResult(leftRows, rightRows, pairs,
            StatsWithPairs(BuildRuleStats(leftRows, rightRows, left.Mapping, right.Mapping), pairs),
            Status(leftRows.Count, rightRows.Count, pairs.Count));
    }

    private static List<MatchPair> CurrentPairs(
        List<MergeRow> left, List<MergeRow> right,
        MergeMapping leftMapping, MergeMapping rightMapping)
    {
        var pr = right.Select(r => Prepare(r, rightMapping)).ToList();
        var byKey = new Dictionary<string, PreparedRow>(StringComparer.Ordinal);
        foreach (var b in pr)
            if (b.Row.Key is not null) byKey[b.Row.Key] = b;
        var pairs = new List<MatchPair>();
        foreach (var a in left)
        {
            if (a.Key is null) continue;
            if (!byKey.TryGetValue(a.Key, out var b)) continue;
            var rule = MergeRules.All.FirstOrDefault(d => d.Key == a.Rule);
            if (rule is null) continue;
            var aPrep = Prepare(a, leftMapping);
            pairs.Add(new MatchPair(a.Key, rule.Key, a.RowNumber, b.Row.RowNumber,
                a.Confirmed && b.Row.Confirmed,
                LinkFor(rule, aPrep).Display, LinkFor(rule, b).Display));
        }
        pairs.Sort((x, y) => string.Compare(x.Key, y.Key, StringComparison.Ordinal));
        return pairs;
    }

    public static MergeResult Summarize(
        List<MergeRow> left, List<MergeRow> right,
        MergeMapping leftMapping, MergeMapping rightMapping)
    {
        var pairs = CurrentPairs(left, right, leftMapping, rightMapping);
        return new MergeResult(left, right, pairs,
            StatsWithPairs(BuildRuleStats(left, right, leftMapping, rightMapping), pairs),
            Status(left.Count, right.Count, pairs.Count));
    }

    public static int NextKeyAfter(IEnumerable<MergeRow> rows)
    {
        var max = 0;
        foreach (var row in rows)
        {
            if (row.Key is null) continue;
            if (int.TryParse(row.Key, out var n) && n > max) max = n;
        }
        return max + 1;
    }

    public static MergeResult RelinkUnmatched(
        List<MergeRow> left, List<MergeRow> right,
        MergeMapping leftMapping, MergeMapping rightMapping,
        int startKey, bool requireConfirmation = true)
    {
        ApplyRules(left, right, leftMapping, rightMapping, startKey, requireConfirmation);
        return Summarize(left, right, leftMapping, rightMapping);
    }

    /// <summary>V1 hasCommonRule: at least one linkable rule on both sides.</summary>
    public static bool HasCommonRule(MergeMapping left, MergeMapping right)
    {
        bool Both(string f) => left.Field(f) is not null && right.Field(f) is not null;
        bool Parts(MergeMapping m) => m.Field("firstName") is not null
            || m.Field("fatherName") is not null || m.Field("lastName") is not null;
        bool Nameable(MergeMapping m) => m.Field("fullName") is not null || Parts(m);
        return Both("fullName") || (Nameable(left) && Nameable(right))
            || Both("nationalId") || Both("personalNo") || Both("shamCash") || Both("phone");
    }
}
