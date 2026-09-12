using ExcelArchive.Domain.Text;

namespace ExcelArchive.Domain.Conflicts;

/// <summary>
/// P4.2 engine for invalid11/missing9/similar2, ported from V1
/// src/lib/conflicts/query.ts localRule + relationalRule (similar only).
/// Conflicting 36 stays P4.3; ignore/cache/export/UI stay P4.4/P4.5.
/// Semantics preserved: original trimmed cell values, numericInput
/// (whitespace-stripped, non-digits retained for validation), stripped
/// numeric keys, mapping-gated missing/name_mismatch, date columns
/// resolved by normalized header, similar groups by normalized name.
/// Explanations mirror V1 SQL concatenations verbatim.
/// </summary>
public static partial class ConflictEngine
{
    public sealed record DateCell(string HeaderRaw, string RawValue);

    public record EngineRow(
        Guid Id,
        Guid FileId,
        Guid GroupId,
        string FileName,
        string OriginalFilename,
        int RowIndex,
        string DisplayName,
        string MotherRaw,
        string NationalRaw,
        string ShamRaw,
        string PersonalRaw,
        string FullRaw,
        string FirstRaw,
        string FatherRaw,
        string LastRaw,
        string JobRaw,
        string PhoneRaw,
        string FunctionalRaw,
        int? SfFunctionalCategory,
        IReadOnlySet<string> MappedFields,
        IReadOnlyList<DateCell> DateCells,
        string ContractRaw = "",
        string SecondaryRaw = "",
        string OrgLevelRaw = "");

    public sealed record EngineIssue(string Rule, string Label, string Explanation);

    // V1 trimCharacters from query.ts (btrim set) + BOM.
    private static readonly char[] TrimChars =
    [
        ' ', '\t', '\n', '\r', '\f', '\v',
        '\u00A0', '\u1680',
        '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005',
        '\u2006', '\u2007', '\u2008', '\u2009', '\u200A',
        '\u2028', '\u2029', '\u202F', '\u205F', '\u3000', '\uFEFF',
    ];

    private static readonly HashSet<char> TrimSet = new(TrimChars);

    public static string TrimCell(string? value)
        => (value ?? "").Trim(TrimChars);

    /// <summary>V1 numericInputSql: latin digits, then remove ALL trim chars.</summary>
    public static string NumericInput(string? value)
    {
        var latin = ArabicNormalizer.ToLatinDigits(value ?? "");
        if (latin.Length == 0) return "";
        var sb = new System.Text.StringBuilder(latin.Length);
        foreach (var c in latin)
            if (!TrimSet.Contains(c))
                sb.Append(c);
        return sb.ToString();
    }

    /// <summary>V1 numericKey: pure digits → stripped leading zeros (or "0"), else null.</summary>
    public static string? NumericKey(string numericInput)
    {
        if (numericInput.Length == 0) return null;
        foreach (var c in numericInput)
            if (c < '0' || c > '9')
                return null;
        var stripped = numericInput.TrimStart('0');
        return stripped.Length == 0 ? "0" : stripped;
    }

    public static string? NationalKey(string? raw)
        => NumericKey(NumericInput(raw));

    public static string Normalize(string? value)
        => ArabicNormalizer.NormalizeStored(value);

    private static string LabelOf(string rule)
        => ConflictCatalog.ByKey.TryGetValue(rule, out var r) ? r.Label : rule;

    public static IReadOnlyList<EngineIssue> EvaluateInvalidMissing(
        EngineRow row, DateOnly today, ISet<string>? selected = null)
    {
        bool Sel(string k) => selected is null || selected.Contains(k);
        var issues = new List<EngineIssue>();

        var nationalTrimmed = TrimCell(row.NationalRaw);
        var nationalInput = NumericInput(row.NationalRaw);
        var nationalKey = NumericKey(nationalInput);

        if (Sel("national_short") && nationalKey is not null && nationalKey.Length <= 8)
            issues.Add(new EngineIssue("national_short", LabelOf("national_short"),
                $"الرقم «{nationalKey}» يتكون من {nationalKey.Length} أرقام قبل تعبئة أصفار العرض؛ المطلوب من 9 إلى 11 رقماً. القيمة الأصلية «{nationalTrimmed}»."));

        if (Sel("national_long") && nationalKey is not null && nationalKey.Length >= 12)
            issues.Add(new EngineIssue("national_long", LabelOf("national_long"),
                $"الرقم «{nationalKey}» يتكون من {nationalKey.Length} أرقام قبل تعبئة أصفار العرض؛ الحد الأعلى 11. القيمة الأصلية «{nationalTrimmed}»."));

        if (Sel("national_characters") && nationalTrimmed != "" && !IsAllDigits(nationalInput))
            issues.Add(new EngineIssue("national_characters", LabelOf("national_characters"),
                $"القيمة الأصلية «{nationalTrimmed}» تحتوي على محارف غير رقمية."));

        var shamTrimmed = TrimCell(row.ShamRaw);
        var shamInput = NumericInput(row.ShamRaw);

        if (Sel("sham_short") && shamInput != "" && shamInput.Length < 16)
            issues.Add(new EngineIssue("sham_short", LabelOf("sham_short"),
                $"القيمة الأصلية «{shamTrimmed}» تحتوي بعد تحويل الأرقام وحذف جميع الفراغات على {shamInput.Length} خانة، والمطلوب 16."));

        if (Sel("sham_long") && shamInput.Length > 16)
            issues.Add(new EngineIssue("sham_long", LabelOf("sham_long"),
                $"القيمة الأصلية «{shamTrimmed}» تحتوي بعد تحويل الأرقام وحذف جميع الفراغات على {shamInput.Length} خانة، والمطلوب 16."));

        if (Sel("sham_characters") && shamInput != "" && !IsAllDigits(shamInput))
            issues.Add(new EngineIssue("sham_characters", LabelOf("sham_characters"),
                $"القيمة الأصلية «{shamTrimmed}» تحتوي بعد حذف الفراغات على محارف غير رقمية؛ الشام كاش يجب أن يتكون من 16 رقماً فقط."));

        if (Sel("name_mismatch") && row.MappedFields.Contains("full_name")
            && row.MappedFields.Contains("first_name")
            && row.MappedFields.Contains("father_name")
            && row.MappedFields.Contains("last_name"))
        {
            var fullTrimmed = TrimCell(row.FullRaw);
            if (fullTrimmed != "")
            {
                var parts = new[] { TrimCell(row.FirstRaw), TrimCell(row.FatherRaw), TrimCell(row.LastRaw) }
                    .Where(p => p != "").ToList();
                var composed = string.Join(" ", parts);
                if (Normalize(fullTrimmed) != Normalize(composed))
                    issues.Add(new EngineIssue("name_mismatch", LabelOf("name_mismatch"),
                        $"الاسم المربوط «{fullTrimmed}» لا يساوي «{composed}» (الاسم + اسم الأب + النسبة) بعد التطبيع."));
            }
        }

        if (Sel("category_invalid") && row.SfFunctionalCategory == 0)
        {
            var funcTrimmed = TrimCell(row.FunctionalRaw);
            issues.Add(new EngineIssue("category_invalid", LabelOf("category_invalid"),
                $"القيمة الأصلية «{funcTrimmed}» لا يمكن تحويلها إلى فئة وظيفية من 1 إلى 5، وتُخزن كـ 0 للخطأ."));
        }

        // Dates: one issue per offending cell (V1 dates CTE yields one row per cell).
        if (Sel("date_invalid") || Sel("date_early") || Sel("date_future"))
        {
            foreach (var cell in row.DateCells)
            {
                var rawTrimmed = TrimCell(cell.RawValue);
                if (rawTrimmed == "") continue;
                var latin = ArabicNormalizer.ToLatinDigits(rawTrimmed);
                // V1 date_values trims again after latin conversion; empty after trim skips.
                var value = latin.Trim(TrimChars);
                if (value == "") continue;
                var parsed = ConflictDateParser.ParseStoredDate(rawTrimmed);
                var headerNorm = Normalize(cell.HeaderRaw);
                var isContractEnd = (headerNorm.Contains("نهاي") || headerNorm.Contains("انتهاء"))
                    && headerNorm.Contains("عقد");

                if (Sel("date_invalid") && parsed is null)
                    issues.Add(new EngineIssue("date_invalid", LabelOf("date_invalid"),
                        $"العمود «{cell.HeaderRaw}»، القيمة «{cell.RawValue}»: تعذر تحويلها إلى تاريخ معتمد."));
                else if (parsed is not null)
                {
                    var date = DateOnly.FromDateTime(parsed.Value);
                    if (Sel("date_early") && date < new DateOnly(1940, 1, 1))
                        issues.Add(new EngineIssue("date_early", LabelOf("date_early"),
                            $"العمود «{cell.HeaderRaw}»، القيمة «{cell.RawValue}»: تسبق 01/01/1940."));
                    if (Sel("date_future") && date > today && !isContractEnd)
                        issues.Add(new EngineIssue("date_future", LabelOf("date_future"),
                            $"العمود «{cell.HeaderRaw}»، القيمة «{cell.RawValue}»: تتجاوز تاريخ اليوم."));
                }
            }
        }

        // Missing: only when the field is mapped; empty trimmed cell flags.
        CheckMissing(issues, row, "missing_national", "national_id", row.NationalRaw, selected);
        CheckMissing(issues, row, "missing_sham", "sham_cash", row.ShamRaw, selected);
        CheckMissing(issues, row, "missing_personal", "personal_no", row.PersonalRaw, selected);
        CheckMissing(issues, row, "missing_mother", "mother_name", row.MotherRaw, selected);
        CheckMissing(issues, row, "missing_full", "full_name", row.FullRaw, selected);
        CheckMissing(issues, row, "missing_first", "first_name", row.FirstRaw, selected);
        CheckMissing(issues, row, "missing_father", "father_name", row.FatherRaw, selected);
        CheckMissing(issues, row, "missing_last", "last_name", row.LastRaw, selected);
        CheckMissing(issues, row, "missing_job", "job_title", row.JobRaw, selected);

        return issues;
    }

    private static void CheckMissing(
        List<EngineIssue> issues, EngineRow row,
        string rule, string field, string? raw, ISet<string>? selected)
    {
        if (selected is not null && !selected.Contains(rule)) return;
        if (!row.MappedFields.Contains(field)) return;
        if (TrimCell(raw) != "") return;
        var header = HeaderFor(row, field);
        string explanation;
        if (header is not null)
            explanation = $"{FieldLabel(field)}: الخلية في العمود «{header}» فارغة.";
        else
            explanation = $"{FieldLabel(field)}: لا توجد قيمة مسجلة أو عمود مربوط بهذا الحقل.";
        issues.Add(new EngineIssue(rule, LabelOf(rule), explanation));
    }

    // Header lookup needs the file mapping; rows carry only the field set,
    // so the service fills this via WithHeaders. Kept simple: explanation
    // falls back to the generic text when the header is unknown.
    public static string? HeaderFor(EngineRow row, string field)
        => row is EngineRowWithHeaders h ? h.HeaderByField.TryGetValue(field, out var v) ? v : null : null;

    private static string FieldLabel(string field)
        => ConflictCatalog.Fields.FirstOrDefault(f => f.Key == field)?.Label ?? field;

    private static bool IsAllDigits(string s)
    {
        if (s.Length == 0) return false;
        foreach (var c in s)
            if (c < '0' || c > '9')
                return false;
        return true;
    }

    /// <summary>Row with header names for missing explanations (service builds it).</summary>
    public sealed record EngineRowWithHeaders(
        Guid Id,
        Guid FileId,
        Guid GroupId,
        string FileName,
        string OriginalFilename,
        int RowIndex,
        string DisplayName,
        string MotherRaw,
        string NationalRaw,
        string ShamRaw,
        string PersonalRaw,
        string FullRaw,
        string FirstRaw,
        string FatherRaw,
        string LastRaw,
        string JobRaw,
        string PhoneRaw,
        string FunctionalRaw,
        int? SfFunctionalCategory,
        IReadOnlySet<string> MappedFields,
        IReadOnlyList<DateCell> DateCells,
        IReadOnlyDictionary<string, string> HeaderByField,
        string ContractRaw = "",
        string SecondaryRaw = "",
        string OrgLevelRaw = "") : EngineRow(
            Id, FileId, GroupId, FileName, OriginalFilename, RowIndex,
            DisplayName, MotherRaw, NationalRaw, ShamRaw, PersonalRaw,
            FullRaw, FirstRaw, FatherRaw, LastRaw, JobRaw, PhoneRaw,
            FunctionalRaw, SfFunctionalCategory, MappedFields, DateCells,
            ContractRaw, SecondaryRaw, OrgLevelRaw);

    /// <summary>
    /// Similar2 groups across all scoped rows (V1 relationalRule).
    /// Returns rowId → similar issues (empty when the rule is unselected
    /// or the group has a single distinct value).
    /// </summary>
    public static IReadOnlyDictionary<Guid, IReadOnlyList<EngineIssue>> EvaluateSimilar(
        IReadOnlyList<EngineRow> rows, ISet<string>? selected = null)
    {
        var result = new Dictionary<Guid, List<EngineIssue>>();
        void Add(Guid id, EngineIssue issue)
        {
            if (!result.TryGetValue(id, out var list))
                result[id] = list = [];
            list.Add(issue);
        }

        var wantNames = selected is null || selected.Contains("similar_names");
        var wantNational = selected is null || selected.Contains("similar_national");

        if (wantNames)
        {
            // person_key NOT NULL (name and mother non-empty after normalize),
            // grouped by name_key having >1 distinct mother_key.
            var byName = new Dictionary<string, List<EngineRow>>(StringComparer.Ordinal);
            foreach (var r in rows)
            {
                var nameKey = Normalize(r.DisplayName);
                var motherKey = Normalize(r.MotherRaw);
                if (nameKey == "" || motherKey == "") continue;
                if (!byName.TryGetValue(nameKey, out var list))
                    byName[nameKey] = list = [];
                list.Add(r);
            }
            foreach (var (_, group) in byName)
            {
                var mothers = group.Select(r => Normalize(r.MotherRaw)).Distinct(StringComparer.Ordinal).ToList();
                if (mothers.Count <= 1) continue;
                var raws = group.Select(r => TrimCell(r.MotherRaw)).Where(s => s != "").OrderBy(s => s, StringComparer.Ordinal).ToList();
                var first = raws.FirstOrDefault() ?? "";
                var last = raws.LastOrDefault() ?? "";
                var total = mothers.Count;
                foreach (var r in group)
                    Add(r.Id, new EngineIssue("similar_names", LabelOf("similar_names"),
                        $"هذا الاسم الثلاثي مرتبط بـ {total} أسماء أمهات مختلفة بعد التطبيع، منها «{first}» و«{last}»."));
            }
        }

        if (wantNational)
        {
            // name_key <> '' AND national_key NOT NULL, grouped by name_key
            // having >1 distinct national_key.
            var byName = new Dictionary<string, List<EngineRow>>(StringComparer.Ordinal);
            foreach (var r in rows)
            {
                var nameKey = Normalize(r.DisplayName);
                if (nameKey == "") continue;
                if (NationalKey(r.NationalRaw) is null) continue;
                if (!byName.TryGetValue(nameKey, out var list))
                    byName[nameKey] = list = [];
                list.Add(r);
            }
            foreach (var (_, group) in byName)
            {
                var keys = group.Select(r => NationalKey(r.NationalRaw)!).Distinct(StringComparer.Ordinal).ToList();
                if (keys.Count <= 1) continue;
                var raws = group.Select(r => TrimCell(r.NationalRaw)).Where(s => s != "").OrderBy(s => s, StringComparer.Ordinal).ToList();
                var first = raws.FirstOrDefault() ?? "";
                var last = raws.LastOrDefault() ?? "";
                var total = keys.Count;
                foreach (var r in group)
                    Add(r.Id, new EngineIssue("similar_national", LabelOf("similar_national"),
                        $"هذا الاسم الثلاثي مرتبط بـ {total} أرقام وطنية مختلفة بعد التطبيع، منها «{first}» و«{last}»."));
            }
        }

        return result.ToDictionary(kv => kv.Key, kv => (IReadOnlyList<EngineIssue>)kv.Value);
    }
}
