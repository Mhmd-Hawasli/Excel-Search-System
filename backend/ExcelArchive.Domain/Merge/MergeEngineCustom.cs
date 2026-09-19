namespace ExcelArchive.Domain.Merge;

/// <summary>
/// User-defined merge spec: one mandatory link field plus one optional
/// confirmation field (both are standard mapped fields, e.g. link by
/// national_id confirmed by sham_cash). Null confirm = link without
/// confirmation (pair stays unconfirmed).
/// </summary>
public sealed record CustomMergeSpec(string LinkField, string? ConfirmField);

/// <summary>Resolved custom rule: stable content-based key, Arabic labels.</summary>
public sealed record CustomMergeRule(
    string Key, int Order, string LinkField, string? ConfirmField,
    string Label, string Method, string Description);

/// <summary>
/// Custom merge section: unlimited user rules (link + optional confirm),
/// executed in order as a cascade over still-unlinked rows — same uniqueness
/// semantics as the six preset rules, same three-sheet Excel export.
/// </summary>
public static partial class MergeEngine
{
    public const int MaxCustomRules = 20;
    public const string CustomKeyPrefix = "custom:";

    private static readonly HashSet<string> TextKindFields = new(StringComparer.Ordinal)
    {
        "fullName", "firstName", "fatherName", "lastName", "motherName", "composedName",
    };

    /// <summary>Pseudo-field: الاسم + اسم الأب + النسبة, falling back to the
    /// full name — mirrors the preset composed_name rule. Never a mapped column.</summary>
    public const string ComposedField = "composedName";
    public const string ComposedFieldLabel = "تركيب الاسم الثلاثي";

    private static bool IsComposed(string field)
        => string.Equals(field, ComposedField, StringComparison.Ordinal);

    public static bool IsCustomField(string field)
        => IsComposed(field) || MergeFields.Keys.Contains(field);

    public static bool IsCustomRuleKey(string key)
        => key.StartsWith(CustomKeyPrefix, StringComparison.Ordinal);

    private static string CustomFieldLabel(string field)
    {
        if (IsComposed(field)) return ComposedFieldLabel;
        return MergeFields.Labels.TryGetValue(field, out var l) ? l : field;
    }

    /// <summary>Validates user specs (field names, duplicates, count).</summary>
    public static void ValidateCustomRules(IReadOnlyList<CustomMergeSpec>? specs)
    {
        if (specs is null || specs.Count == 0)
            throw new InvalidDataException("حدد قاعدة واحدة على الأقل للدمج المخصص.");
        if (specs.Count > MaxCustomRules)
            throw new InvalidDataException($"عدد القواعد المخصصة يتجاوز الحد المسموح ({MaxCustomRules}).");
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var spec in specs)
        {
            var link = (spec.LinkField ?? "").Trim();
            var confirm = string.IsNullOrWhiteSpace(spec.ConfirmField) ? null : spec.ConfirmField.Trim();
            if (!IsCustomField(link))
                throw new InvalidDataException($"حقل الربط غير معروف: {spec.LinkField}.");
            if (confirm is not null && !IsCustomField(confirm))
                throw new InvalidDataException($"حقل التأكيد غير معروف: {spec.ConfirmField}.");
            if (confirm is not null && string.Equals(link, confirm, StringComparison.Ordinal))
                throw new InvalidDataException("حقل التأكيد يجب أن يختلف عن حقل الربط.");
            if (!seen.Add(link + "\u0000" + (confirm ?? "-")))
                throw new InvalidDataException($"قاعدة مكررة: الربط بـ «{CustomFieldLabel(link)}»" +
                    (confirm is null ? " بدون تأكيد." : $" مع التأكيد بـ «{CustomFieldLabel(confirm)}»."));
        }
    }

    /// <summary>Resolves specs to rules with stable content-based keys.</summary>
    public static List<CustomMergeRule> BuildCustomRules(IReadOnlyList<CustomMergeSpec> specs)
    {
        ValidateCustomRules(specs);
        var rules = new List<CustomMergeRule>(specs.Count);
        for (var i = 0; i < specs.Count; i++)
        {
            var link = specs[i].LinkField.Trim();
            var confirm = string.IsNullOrWhiteSpace(specs[i].ConfirmField) ? null : specs[i].ConfirmField!.Trim();
            var linkLabel = CustomFieldLabel(link);
            var label = confirm is null
                ? $"القاعدة المخصصة {i + 1} — الربط بـ {linkLabel} بدون تأكيد"
                : $"القاعدة المخصصة {i + 1} — الربط بـ {linkLabel} مع التأكيد بـ {CustomFieldLabel(confirm)}";
            var description = confirm is null
                ? $"شرطها ظهور «{linkLabel}» مرة واحدة فقط في الملف الواحد. تُربط الصفوف المتطابقة دون تأكيد وتبقى «غير مؤكدة» للمراجعة اليدوية."
                : $"شرطها ظهور «{linkLabel}» مرة واحدة فقط في الملف الواحد. يُقارن حقل الربط بعد التنميط، ويُشترط تطابق «{CustomFieldLabel(confirm)}» أيضًا، وإلا بقي الصف بلا ربط.";
            rules.Add(new CustomMergeRule(
                CustomKeyPrefix + link + ":" + (confirm ?? "-"),
                i + 1, link, confirm, label, $"مطابقة عن طريق {linkLabel}", description));
        }
        return rules;
    }

    private static string ComposedValue(MergeRow row, MergeMapping mapping)
    {
        var parts = new[] { "firstName", "fatherName", "lastName" }
            .Select(f => Trimmed(Cell(row, mapping.Field(f))))
            .Where(s => s.Length > 0);
        var composed = string.Join(" ", parts);
        return composed.Length > 0 ? composed : Trimmed(Cell(row, mapping.Field("fullName")));
    }

    private static Link CustomLink(string field, MergeRow row, MergeMapping mapping)
    {
        if (IsComposed(field)) return TextLink(ComposedValue(row, mapping));
        var raw = Cell(row, mapping.Field(field));
        return TextKindFields.Contains(field) ? TextLink(raw) : NumericLink(raw);
    }

    /// <summary>Composed needs fullName or any name part on the side.</summary>
    private static bool CustomFieldMapped(string field, MergeMapping mapping)
        => IsComposed(field)
            ? mapping.Field("fullName") is not null
                || mapping.Field("firstName") is not null
                || mapping.Field("fatherName") is not null
                || mapping.Field("lastName") is not null
            : mapping.Field(field) is not null;

    private static HashSet<string> AmbiguousCustomLinks(
        IReadOnlyList<PreparedRow> rows, Func<PreparedRow, Link> linker)
    {
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var p in rows)
        {
            var link = linker(p);
            if (link.Key.Length == 0) continue;
            counts[link.Key] = counts.TryGetValue(link.Key, out var c) ? c + 1 : 1;
        }
        var ambiguous = new HashSet<string>(StringComparer.Ordinal);
        foreach (var kv in counts)
            if (kv.Value > 1) ambiguous.Add(kv.Key);
        return ambiguous;
    }

    public static (List<MatchPair> Pairs, int NextKey) ApplyCustomRules(
        List<MergeRow> left, List<MergeRow> right,
        MergeMapping leftMapping, MergeMapping rightMapping,
        IReadOnlyList<CustomMergeRule> rules,
        int startKey, Action<string, int, int>? onRuleDone = null)
    {
        var counter = startKey;
        var pairs = new List<MatchPair>();
        var preparedLeft = left.Select(r => Prepare(r, leftMapping)).ToList();
        var preparedRight = right.Select(r => Prepare(r, rightMapping)).ToList();

        Link Linker(PreparedRow p, MergeMapping m, string field) => CustomLink(field, p.Row, m);

        void LinkPair(CustomMergeRule rule, PreparedRow a, PreparedRow chosen, bool confirmed)
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
                confirmed, Linker(a, leftMapping, rule.LinkField).Display,
                Linker(chosen, rightMapping, rule.LinkField).Display));
        }

        for (var ruleIndex = 0; ruleIndex < rules.Count; ruleIndex++)
        {
            var rule = rules[ruleIndex];
            var ambiguousLeft = AmbiguousCustomLinks(preparedLeft,
                p => Linker(p, leftMapping, rule.LinkField));
            var ambiguousRight = AmbiguousCustomLinks(preparedRight,
                p => Linker(p, rightMapping, rule.LinkField));
            var rightByLink = new Dictionary<string, List<PreparedRow>>(StringComparer.Ordinal);
            foreach (var b in preparedRight)
            {
                var bLink = Linker(b, rightMapping, rule.LinkField);
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
                var aLink = Linker(a, leftMapping, rule.LinkField);
                if (aLink.Key.Length == 0) continue;
                if (ambiguousLeft.Contains(aLink.Key) || ambiguousRight.Contains(aLink.Key))
                    continue;
                var candidates = rightByLink.TryGetValue(aLink.Key, out var bucket)
                    ? bucket.Where(b => b.Row.Key is null).ToList()
                    : [];
                if (candidates.Count == 0) continue;

                PreparedRow? chosen = null;
                var confirmed = false;
                if (rule.ConfirmField is not null)
                {
                    var aConfirm = Linker(a, leftMapping, rule.ConfirmField);
                    if (aConfirm.Key.Length == 0) continue;
                    var exact = candidates
                        .Where(b => Linker(b, rightMapping, rule.ConfirmField).Key == aConfirm.Key)
                        .ToList();
                    if (exact.Count != 1) continue;
                    chosen = exact[0];
                    confirmed = true;
                }
                else
                {
                    if (candidates.Count != 1) continue;
                    chosen = candidates[0];
                }
                LinkPair(rule, a, chosen, confirmed);
            }
            onRuleDone?.Invoke(rule.Key, ruleIndex, rules.Count);
        }
        return (pairs, counter);
    }

    private static string? CustomAvailabilityReason(
        CustomMergeRule rule,
        IReadOnlyList<PreparedRow> left, IReadOnlyList<PreparedRow> right,
        MergeMapping leftMapping, MergeMapping rightMapping)
    {
        string? Missing(MergeMapping mapping, string side)
        {
            if (!CustomFieldMapped(rule.LinkField, mapping))
                return IsComposed(rule.LinkField)
                    ? $"لا يوجد عمود «{CustomFieldLabel("fullName")}» أو أعمدة الاسم واسم الأب والنسبة في الجدول {side}."
                    : $"لا يوجد عمود «{CustomFieldLabel(rule.LinkField)}» في الجدول {side}.";
            if (rule.ConfirmField is not null && !CustomFieldMapped(rule.ConfirmField, mapping))
                return IsComposed(rule.ConfirmField)
                    ? $"لا يوجد عمود «{CustomFieldLabel("fullName")}» أو أعمدة الاسم واسم الأب والنسبة في الجدول {side}."
                    : $"لا يوجد عمود «{CustomFieldLabel(rule.ConfirmField)}» في الجدول {side}.";
            return null;
        }
        var leftLinkable = left.Any(r => CustomLink(rule.LinkField, r.Row, leftMapping).Key.Length > 0);
        var rightLinkable = right.Any(r => CustomLink(rule.LinkField, r.Row, rightMapping).Key.Length > 0);
        return Missing(leftMapping, "الأول") ?? Missing(rightMapping, "الثاني")
            ?? (!leftLinkable ? "لا توجد قيم كافية في الجدول الأول لاستخدام القاعدة."
                : !rightLinkable ? "لا توجد قيم كافية في الجدول الثاني لاستخدام القاعدة." : null);
    }

    private static List<RuleStat> BuildCustomRuleStats(
        List<MergeRow> left, List<MergeRow> right,
        MergeMapping leftMapping, MergeMapping rightMapping,
        IReadOnlyList<CustomMergeRule> rules)
    {
        var pl = left.Select(r => Prepare(r, leftMapping)).ToList();
        var pr = right.Select(r => Prepare(r, rightMapping)).ToList();
        return rules.Select(rule =>
        {
            var reason = CustomAvailabilityReason(rule, pl, pr, leftMapping, rightMapping);
            return new RuleStat(rule.Key, rule.Order, rule.Label, rule.Description,
                reason is null, reason, 0, []);
        }).ToList();
    }

    private static List<RuleStat> StatsWithCustomPairs(
        List<RuleStat> stats, List<MatchPair> pairs)
    {
        foreach (var s in stats)
            s.Pairs.AddRange(pairs.Where(p => p.Rule == s.Key));
        return stats
            .Select(s => s with { MatchedPairs = s.Pairs.Count }).ToList();
    }

    public static MergeResult RunCustomMerge(
        MergeTableInput left, MergeTableInput right,
        IReadOnlyList<CustomMergeRule> rules,
        int startKey = 1, Action<string, int, int>? onRuleDone = null)
    {
        var leftRows = left.Rows.Select(r => new MergeRow
        {
            RowNumber = r.RowNumber, Cells = r.Cells.ToList(),
            Key = null, Rule = null, Confirmed = false,
        }).ToList();
        var rightRows = right.Rows.Select(r => new MergeRow
        {
            RowNumber = r.RowNumber, Cells = r.Cells.ToList(),
            Key = null, Rule = null, Confirmed = false,
        }).ToList();
        var (pairs, _) = ApplyCustomRules(leftRows, rightRows, left.Mapping, right.Mapping,
            rules, startKey, onRuleDone);
        return new MergeResult(leftRows, rightRows, pairs,
            StatsWithCustomPairs(
                BuildCustomRuleStats(leftRows, rightRows, left.Mapping, right.Mapping, rules), pairs),
            Status(leftRows.Count, rightRows.Count, pairs.Count));
    }

    private static List<MatchPair> CurrentCustomPairs(
        List<MergeRow> left, List<MergeRow> right,
        MergeMapping leftMapping, MergeMapping rightMapping,
        IReadOnlyList<CustomMergeRule> rules)
    {
        var byKey = rules.ToDictionary(r => r.Key, StringComparer.Ordinal);
        var pr = right.Select(r => Prepare(r, rightMapping)).ToList();
        var byRowKey = new Dictionary<string, PreparedRow>(StringComparer.Ordinal);
        foreach (var b in pr)
            if (b.Row.Key is not null) byRowKey[b.Row.Key] = b;
        var pairs = new List<MatchPair>();
        foreach (var a in left)
        {
            if (a.Key is null) continue;
            if (!byRowKey.TryGetValue(a.Key, out var b)) continue;
            if (!byKey.TryGetValue(a.Rule ?? "", out var rule)) continue;
            pairs.Add(new MatchPair(a.Key, rule.Key, a.RowNumber, b.Row.RowNumber,
                a.Confirmed && b.Row.Confirmed,
                CustomLink(rule.LinkField, a, leftMapping).Display,
                CustomLink(rule.LinkField, b.Row, rightMapping).Display));
        }
        pairs.Sort((x, y) => string.Compare(x.Key, y.Key, StringComparison.Ordinal));
        return pairs;
    }

    public static MergeResult SummarizeCustom(
        List<MergeRow> left, List<MergeRow> right,
        MergeMapping leftMapping, MergeMapping rightMapping,
        IReadOnlyList<CustomMergeRule> rules)
    {
        var pairs = CurrentCustomPairs(left, right, leftMapping, rightMapping, rules);
        return new MergeResult(left, right, pairs,
            StatsWithCustomPairs(
                BuildCustomRuleStats(left, right, leftMapping, rightMapping, rules), pairs),
            Status(left.Count, right.Count, pairs.Count));
    }

    public static MergeResult RelinkUnmatchedCustom(
        List<MergeRow> left, List<MergeRow> right,
        MergeMapping leftMapping, MergeMapping rightMapping,
        IReadOnlyList<CustomMergeRule> rules,
        int startKey)
    {
        ApplyCustomRules(left, right, leftMapping, rightMapping, rules, startKey);
        return SummarizeCustom(left, right, leftMapping, rightMapping, rules);
    }

    /// <summary>At least one custom rule linkable on both sides.</summary>
    public static bool HasCommonCustomRule(
        MergeMapping left, MergeMapping right, IReadOnlyList<CustomMergeRule> rules)
        => rules.Any(r => CustomFieldMapped(r.LinkField, left) && CustomFieldMapped(r.LinkField, right));
}
