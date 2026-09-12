namespace ExcelArchive.Domain.Conflicts;

/// <summary>
/// P4.3 engine for conflicting36 (14 existing + 22 directed pairs),
/// ported from V1 src/lib/conflicts/query.ts relationalRule +
/// pairDifferenceRule + groupKeyExpression (conflicting branch).
/// Person key = normalized full name + mother name; contract_pair combines
/// primary + secondary codes. Directed A→B ≠ B→A (asymmetric fixtures).
/// Explanations mirror V1 SQL concatenations verbatim.
/// </summary>
public static partial class ConflictEngine
{
    private sealed record ConflictingKeys(
        EngineRow Row,
        string NameKey,
        string MotherKey,
        string? PersonKey,
        string? NationalKey,
        string? ShamKey,
        string? PersonalKey,
        string? ContractKey,
        string? ContractPairKey,
        string? PhoneKey,
        string? JobKey,
        string? FunctionalKey,
        string? OrgKey);

    private static ConflictingKeys KeysOf(EngineRow row)
    {
        var nameKey = Normalize(row.DisplayName);
        var motherKey = Normalize(row.MotherRaw);
        var contractKey = Normalize(row.ContractRaw);
        if (contractKey == "") contractKey = null;
        var secondaryKey = Normalize(row.SecondaryRaw);
        if (secondaryKey == "") secondaryKey = null;
        string? pairKey = (contractKey ?? "") + "|" + (secondaryKey ?? "");
        if (pairKey == "|") pairKey = null;
        var phoneDigits = DigitsOnly(row.PhoneRaw);
        string? phoneKey = phoneDigits == "" ? null : phoneDigits.TrimStart('0');
        if (phoneKey == "") phoneKey = null;
        var jobKey = Normalize(row.JobRaw);
        if (jobKey == "") jobKey = null;
        var funcTrimmed = TrimCell(row.SfFunctionalCategory?.ToString());
        string? funcKey = funcTrimmed == "" ? null : funcTrimmed;
        var orgKey = Normalize(row.OrgLevelRaw);
        if (orgKey == "") orgKey = null;
        return new ConflictingKeys(
            row, nameKey, motherKey,
            nameKey != "" && motherKey != "" ? nameKey + "\u0000" + motherKey : null,
            NationalKey(row.NationalRaw),
            NumericKey(NumericInput(row.ShamRaw)),
            NumericKey(TrimCell(row.PersonalRaw)),
            contractKey, pairKey, phoneKey, jobKey, funcKey, orgKey);
    }

    private static string DigitsOnly(string? value)
    {
        var latin = Text.ArabicNormalizer.ToLatinDigits(value ?? "");
        var sb = new System.Text.StringBuilder(latin.Length);
        foreach (var c in latin)
            if (c >= '0' && c <= '9')
                sb.Append(c);
        return sb.ToString();
    }

    /// <summary>V1 categoryDisplaySql: numeric 1..5 → Arabic label, else unknown.</summary>
    public static string FunctionalCategoryDisplay(string? stored)
    {
        var t = TrimCell(stored);
        if (t.Length > 0)
        {
            var allDigits = true;
            foreach (var c in t)
                if (c < '0' || c > '9') { allDigits = false; break; }
            if (allDigits && int.TryParse(t, out var n) && n >= 1 && n <= 5)
                return FunctionalCategoryLabels[n - 1];
        }
        return "فئة غير معروفة";
    }

    private static readonly string[] FunctionalCategoryLabels =
    [
        "فئة الأولى", "فئة الثانية", "فئة الثالثة", "فئة الرابعة", "فئة الخامسة",
    ];

    private static string? SideKey(string side, ConflictingKeys k) => side switch
    {
        "national_id" => k.NationalKey,
        "person" => k.PersonKey,
        "personal_no" => k.PersonalKey,
        "sham_cash" => k.ShamKey,
        "contract_pair" => k.ContractPairKey,
        "phone" => k.PhoneKey,
        _ => null,
    };

    private static string SideDisplay(string side, ConflictingKeys k)
    {
        var row = k.Row;
        return side switch
        {
            "national_id" => TrimCell(row.NationalRaw),
            "person" => DisplayOf(row) + " (الأم: " + TrimCell(row.MotherRaw) + ")",
            "personal_no" => TrimCell(row.PersonalRaw),
            "sham_cash" => TrimCell(row.ShamRaw),
            "contract_pair" => ContractPairDisplay(k.ContractPairKey),
            "phone" => TrimCell(row.PhoneRaw),
            _ => "",
        };
    }

    private static string ContractPairDisplay(string? key)
    {
        if (key is null) return "— + —";
        var parts = key.Split('|');
        var left = parts.Length > 0 && parts[0] != "" ? parts[0] : "—";
        var right = parts.Length > 1 && parts[1] != "" ? parts[1] : "—";
        return left + " + " + right;
    }

    private static string DisplayOf(EngineRow row)
    {
        var d = TrimCell(row.DisplayName);
        return d != "" ? d : TrimCell(row.FullRaw);
    }

    /// <summary>
    /// Evaluates all 36 conflicting rules over scoped rows.
    /// Returns rowId → issues (respects the selected rule set).
    /// </summary>
    public static IReadOnlyDictionary<Guid, IReadOnlyList<EngineIssue>> EvaluateConflicting(
        IReadOnlyList<EngineRow> rows, ISet<string>? selected = null)
    {
        var result = new Dictionary<Guid, List<EngineIssue>>();
        void Add(Guid id, EngineIssue issue)
        {
            if (!result.TryGetValue(id, out var list))
                result[id] = list = [];
            list.Add(issue);
        }
        bool Sel(string k) => selected is null || selected.Contains(k);

        var keyed = rows.Select(KeysOf).ToList();

        // ---- duplicate_* (intra-file) ----
        void Duplicate(string rule, Func<ConflictingKeys, string?> key, Func<EngineRow, string> raw)
        {
            if (!Sel(rule)) return;
            foreach (var g in keyed.Where(k => key(k) is not null)
                         .GroupBy(k => (k.Row.FileId, Key: key(k)!)))
            {
                if (g.Count() <= 1) continue;
                foreach (var k in g)
                    Add(k.Row.Id, new EngineIssue(rule, LabelOf(rule),
                        $"القيمة «{TrimCell(raw(k.Row))}» مكررة في {g.Count()} صفوف داخل ملف المصدر نفسه."));
            }
        }
        Duplicate("duplicate_national", k => k.NationalKey, r => r.NationalRaw);
        Duplicate("duplicate_sham", k => k.ShamKey, r => r.ShamRaw);
        Duplicate("duplicate_personal", k => k.PersonalKey, r => r.PersonalRaw);
        Duplicate("duplicate_contract", k => k.ContractKey, r => r.ContractRaw);

        // ---- *_people (one key → several persons) ----
        void People(string rule, Func<ConflictingKeys, string?> key, Func<EngineRow, string> raw)
        {
            if (!Sel(rule)) return;
            foreach (var g in keyed.Where(k => k.PersonKey is not null && key(k) is not null)
                         .GroupBy(k => key(k)!))
            {
                var persons = g.Select(k => k.PersonKey!).Distinct(StringComparer.Ordinal).ToList();
                if (persons.Count <= 1) continue;
                foreach (var k in g)
                    Add(k.Row.Id, new EngineIssue(rule, LabelOf(rule),
                        $"القيمة «{TrimCell(raw(k.Row))}» مرتبطة بـ {persons.Count} أشخاص مختلفين في جميع الملفات؛ الشخص هو الاسم الثلاثي مع اسم الأم."));
            }
        }
        People("national_people", k => k.NationalKey, r => r.NationalRaw);
        People("sham_people", k => k.ShamKey, r => r.ShamRaw);
        People("personal_people", k => k.PersonalKey, r => r.PersonalRaw);

        // ---- person_* (one person → several values) ----
        void Person(string rule, string field, Func<ConflictingKeys, string?> key,
            Func<EngineRow, string> raw, Func<string, string>? display = null)
        {
            if (!Sel(rule)) return;
            display ??= (s => s);
            foreach (var g in keyed.Where(k => k.PersonKey is not null && key(k) is not null)
                         .GroupBy(k => k.PersonKey!))
            {
                var values = g.Select(k => key(k)!).Distinct(StringComparer.Ordinal).ToList();
                if (values.Count <= 1) continue;
                var raws = g.Select(k => TrimCell(raw(k.Row)))
                    .Select(display).OrderBy(s => s, StringComparer.Ordinal).ToList();
                var first = raws.FirstOrDefault() ?? "";
                var last = raws.LastOrDefault() ?? "";
                foreach (var k in g.Where(k => key(k) is not null))
                {
                    var current = display(TrimCell(raw(k.Row)));
                    Add(k.Row.Id, new EngineIssue(rule, LabelOf(rule),
                        $"الشخص نفسه مرتبط بـ {values.Count} قيم مختلفة لحقل «{FieldLabel(field)}»، منها «{first}» و«{last}». قيمة هذا السجل «{current}»."));
                }
            }
        }
        Person("person_national", "national_id", k => k.NationalKey, r => r.NationalRaw);
        Person("person_sham", "sham_cash", k => k.ShamKey, r => r.ShamRaw);
        Person("person_personal", "personal_no", k => k.PersonalKey, r => r.PersonalRaw);
        Person("person_contract", "contract_code", k => k.ContractKey, r => r.ContractRaw);
        Person("person_category", "functional_category",
            k => k.FunctionalKey, r => TrimCell(r.SfFunctionalCategory?.ToString()),
            FunctionalCategoryDisplay);
        Person("person_org_level", "organizational_level", k => k.OrgKey, r => r.OrgLevelRaw);

        // ---- person_job (special: job_values semantics, mapped files only) ----
        if (Sel("person_job"))
        {
            var eligible = keyed.Where(k => k.PersonKey is not null
                && k.Row.MappedFields.Contains("job_title") && k.JobKey is not null).ToList();
            foreach (var g in eligible.GroupBy(k => k.PersonKey!))
            {
                var values = g.Select(k => k.JobKey!).Distinct(StringComparer.Ordinal).ToList();
                if (values.Count <= 1) continue;
                var raws = g.Select(k => TrimCell(k.Row.JobRaw))
                    .OrderBy(s => s, StringComparer.Ordinal).ToList();
                var first = raws.FirstOrDefault() ?? "";
                var last = raws.LastOrDefault() ?? "";
                foreach (var k in g)
                {
                    var header = HeaderFor(k.Row, "job_title") ?? "job_title";
                    Add(k.Row.Id, new EngineIssue("person_job", LabelOf("person_job"),
                        $"الشخص نفسه مرتبط بـ {values.Count} مسميات وظيفية مختلفة: منها «{first}» و«{last}». عمود هذا السجل «{header}»، وقيمته «{TrimCell(k.Row.JobRaw)}»."));
                }
            }
        }

        // ---- directed pair_* (from → more than one to; asymmetric) ----
        foreach (var rule in ConflictCatalog.Rules)
        {
            if (rule.Category != "conflicting" || rule.PairFrom is null || rule.PairTo is null)
                continue;
            if (!Sel(rule.Key)) continue;
            var from = rule.PairFrom;
            var to = rule.PairTo;
            var toLabel = ConflictCatalog.PairLabels.TryGetValue(to, out var l) ? l : to;
            foreach (var g in keyed.Where(k => SideKey(from, k) is not null && SideKey(to, k) is not null)
                         .GroupBy(k => SideKey(from, k)!))
            {
                var toValues = g.Select(k => SideKey(to, k)!).Distinct(StringComparer.Ordinal).ToList();
                if (toValues.Count <= 1) continue;
                var displays = g.Where(k => SideKey(to, k) is not null)
                    .Select(k => SideDisplay(to, k)).OrderBy(s => s, StringComparer.Ordinal).ToList();
                var first = displays.FirstOrDefault() ?? "";
                var last = displays.LastOrDefault() ?? "";
                foreach (var k in keyed.Where(k => SideKey(from, k) == g.Key))
                {
                    Add(k.Row.Id, new EngineIssue(rule.Key, rule.Label,
                        $"«{SideDisplay(from, k)}» مرتبط بـ {toValues.Count} قيم مختلفة لـ «{toLabel}»، منها «{first}» و«{last}». قيمة هذا السجل: «{SideDisplay(to, k)}»."));
                }
            }
        }

        return result.ToDictionary(kv => kv.Key, kv => (IReadOnlyList<EngineIssue>)kv.Value);
    }

    /// <summary>
    /// V1 groupKeyExpression (conflicting branch): grouping key for one row
    /// under a single selected rule, or null when rows stay isolated.
    /// </summary>
    public static string? ConflictingGroupKey(string ruleKey, ConflictingRowView row)
    {
        if (ruleKey.StartsWith("duplicate_", StringComparison.Ordinal))
        {
            var key = ruleKey switch
            {
                "duplicate_national" => row.NationalKey,
                "duplicate_sham" => row.ShamKey,
                "duplicate_personal" => row.PersonalKey,
                "duplicate_contract" => row.ContractKey,
                _ => null,
            };
            return key is null ? null : row.FileName + "|" + key;
        }
        if (ruleKey.EndsWith("_people", StringComparison.Ordinal))
        {
            return ruleKey switch
            {
                "national_people" => row.NationalKey,
                "sham_people" => row.ShamKey,
                "personal_people" => row.PersonalKey,
                _ => null,
            };
        }
        if (ruleKey.StartsWith("person_", StringComparison.Ordinal) || ruleKey == "person_job")
            return row.NameKey + "|" + row.MotherKey;
        if (ruleKey.StartsWith("pair_", StringComparison.Ordinal)
            && ConflictCatalog.ByKey.TryGetValue(ruleKey, out var rule) && rule.PairFrom is not null)
        {
            return rule.PairFrom switch
            {
                "national_id" => row.NationalKey,
                "person" => row.NameKey + "|" + row.MotherKey,
                "personal_no" => row.PersonalKey,
                "sham_cash" => row.ShamKey,
                "contract_pair" => row.ContractPairKey,
                "phone" => row.PhoneKey,
                _ => null,
            };
        }
        return null;
    }

    /// <summary>Flat key view consumed by ConflictingGroupKey (service builds it).</summary>
    public sealed record ConflictingRowView(
        string FileName,
        string NameKey,
        string MotherKey,
        string? NationalKey,
        string? ShamKey,
        string? PersonalKey,
        string? ContractKey,
        string? ContractPairKey,
        string? PhoneKey);

    public static ConflictingRowView ViewOf(EngineRow row)
    {
        var k = KeysOf(row);
        return new ConflictingRowView(
            row.FileName, k.NameKey, k.MotherKey, k.NationalKey, k.ShamKey,
            k.PersonalKey, k.ContractKey, k.ContractPairKey, k.PhoneKey);
    }
}
