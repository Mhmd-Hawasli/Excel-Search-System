namespace ExcelArchive.Domain.Conflicts;

/// <summary>
/// Frozen port of V1 src/lib/conflicts/catalog.ts: the 58 conflict rules
/// with exact keys, categories, fields, Arabic labels, directed-pair sides
/// and sortable keys. Changing this requires re-fixturing P4.6 (docs/07.6).
/// Labels are copied verbatim from V1; do not retranslate.
/// </summary>
public static class ConflictCatalog
{
    public record Category(string Key, string Label, string Description);
    public record Field(string Key, string Label);
    public record Rule(string Key, string Category, string Field, string Label, string? PairFrom = null, string? PairTo = null);

    public static readonly IReadOnlyList<Category> Categories =
    [
        new("invalid", "بيانات خاطئة", "قيم غير صالحة أو لا تطابق تركيبها"),
        new("missing", "بيانات ناقصة", "حقول أساسية أو أعمدة مرتبطة فارغة"),
        new("similar", "تشابه الأسماء", "الاسم الثلاثي نفسه مع اختلاف اسم الأم"),
        new("conflicting", "تضارب البيانات", "تكرار المعرّفات واختلاف بيانات الشخص"),
    ];

    public static readonly IReadOnlyList<Field> Fields =
    [
        new("national_id", "الرقم الوطني"),
        new("sham_cash", "الشام كاش"),
        new("personal_no", "الرقم الذاتي"),
        new("contract_code", "رمز العقد الرئيسي"),
        new("full_name", "الاسم الثلاثي"),
        new("mother_name", "اسم الأم"),
        new("first_name", "الاسم"),
        new("father_name", "اسم الأب"),
        new("last_name", "النسبة"),
        new("date", "التواريخ"),
        new("job_title", "المسمى الوظيفي"),
        new("functional_category", "الفئة الوظيفية"),
        new("organizational_level", "السوية التنظيمية الأساسية"),
        new("phone", "رقم الهاتف"),
        new("contract_pair", "رمز العقد (أساسي + ثانوي)"),
    ];

    public static readonly IReadOnlyList<string> PairSides =
    [
        "national_id", "person", "personal_no", "sham_cash", "contract_pair", "phone",
    ];

    public static readonly IReadOnlyDictionary<string, string> PairLabels =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["national_id"] = "الرقم الوطني",
            ["person"] = "الشخص",
            ["personal_no"] = "الرقم الذاتي",
            ["sham_cash"] = "الشام كاش",
            ["contract_pair"] = "رمز العقد",
            ["phone"] = "رقم الهاتف",
        };

    public static readonly IReadOnlyList<Rule> Rules =
    [
        new("national_short", "invalid", "national_id", "رقم وطني من 8 أرقام أو أقل"),
        new("national_long", "invalid", "national_id", "رقم وطني من 12 خانة أو أكثر"),
        new("national_characters", "invalid", "national_id", "محارف داخل الرقم الوطني"),
        new("sham_short", "invalid", "sham_cash", "الشام كاش أقل من 16 خانة"),
        new("sham_long", "invalid", "sham_cash", "الشام كاش أكثر من 16 خانة"),
        new("sham_characters", "invalid", "sham_cash", "محارف داخل الشام كاش"),
        new("name_mismatch", "invalid", "full_name", "الاسم الثلاثي لا يطابق تركيب الاسم"),
        new("category_invalid", "invalid", "functional_category", "الفئة الوظيفية غير معروفة"),
        new("date_invalid", "invalid", "date", "تاريخ تعذر تحويله"),
        new("date_early", "invalid", "date", "تاريخ قبل عام 1940"),
        new("date_future", "invalid", "date", "تاريخ بعد اليوم"),
        new("missing_national", "missing", "national_id", "الرقم الوطني مفقود"),
        new("missing_sham", "missing", "sham_cash", "الشام كاش مفقود"),
        new("missing_personal", "missing", "personal_no", "الرقم الذاتي مفقود"),
        new("missing_mother", "missing", "mother_name", "اسم الأم مفقود"),
        new("missing_full", "missing", "full_name", "الاسم الثلاثي المربوط فارغ"),
        new("missing_first", "missing", "first_name", "الاسم المربوط فارغ"),
        new("missing_father", "missing", "father_name", "اسم الأب المربوط فارغ"),
        new("missing_last", "missing", "last_name", "النسبة المربوطة فارغة"),
        new("missing_job", "missing", "job_title", "المسمى الوظيفي المربوط فارغ"),
        new("similar_names", "similar", "full_name", "اسم ثلاثي واحد وأسماء أمهات مختلفة"),
        new("similar_national", "similar", "full_name", "اسم ثلاثي واحد وأرقام وطنية مختلفة"),
        new("duplicate_national", "conflicting", "national_id", "الرقم الوطني مكرر داخل الملف"),
        new("duplicate_sham", "conflicting", "sham_cash", "الشام كاش مكرر داخل الملف"),
        new("duplicate_personal", "conflicting", "personal_no", "الرقم الذاتي مكرر داخل الملف"),
        new("duplicate_contract", "conflicting", "contract_code", "رمز العقد الرئيسي مكرر داخل الملف"),
        new("national_people", "conflicting", "national_id", "الرقم الوطني مرتبط بأكثر من شخص"),
        new("sham_people", "conflicting", "sham_cash", "الشام كاش مرتبط بأكثر من شخص"),
        new("personal_people", "conflicting", "personal_no", "الرقم الذاتي مرتبط بأكثر من شخص"),
        new("person_national", "conflicting", "national_id", "الشخص مرتبط بأكثر من رقم وطني"),
        new("person_sham", "conflicting", "sham_cash", "الشخص مرتبط بأكثر من شام كاش"),
        new("person_contract", "conflicting", "contract_code", "الشخص مرتبط بأكثر من رمز عقد رئيسي"),
        new("person_personal", "conflicting", "personal_no", "الشخص مرتبط بأكثر من رقم ذاتي"),
        new("person_job", "conflicting", "job_title", "الشخص مرتبط بأكثر من مسمى وظيفي"),
        new("person_category", "conflicting", "functional_category", "الشخص مرتبط بأكثر من فئة وظيفية"),
        new("person_org_level", "conflicting", "organizational_level", "الشخص مرتبط بأكثر من سوية تنظيمية أساسية"),
        new("pair_national_personal", "conflicting", "personal_no", "الرقم الوطني مرتبط بأكثر من رقم ذاتي", "national_id", "personal_no"),
        new("pair_national_sham", "conflicting", "sham_cash", "الرقم الوطني مرتبط بأكثر من شام كاش", "national_id", "sham_cash"),
        new("pair_national_contract", "conflicting", "contract_pair", "الرقم الوطني مرتبط بأكثر من رمز عقد", "national_id", "contract_pair"),
        new("pair_national_phone", "conflicting", "phone", "الرقم الوطني مرتبط بأكثر من رقم هاتف", "national_id", "phone"),
        new("pair_personal_national", "conflicting", "national_id", "الرقم الذاتي مرتبط بأكثر من رقم وطني", "personal_no", "national_id"),
        new("pair_personal_sham", "conflicting", "sham_cash", "الرقم الذاتي مرتبط بأكثر من شام كاش", "personal_no", "sham_cash"),
        new("pair_personal_contract", "conflicting", "contract_pair", "الرقم الذاتي مرتبط بأكثر من رمز عقد", "personal_no", "contract_pair"),
        new("pair_personal_phone", "conflicting", "phone", "الرقم الذاتي مرتبط بأكثر من رقم هاتف", "personal_no", "phone"),
        new("pair_sham_national", "conflicting", "national_id", "الشام كاش مرتبط بأكثر من رقم وطني", "sham_cash", "national_id"),
        new("pair_sham_personal", "conflicting", "personal_no", "الشام كاش مرتبط بأكثر من رقم ذاتي", "sham_cash", "personal_no"),
        new("pair_sham_contract", "conflicting", "contract_pair", "الشام كاش مرتبط بأكثر من رمز عقد", "sham_cash", "contract_pair"),
        new("pair_sham_phone", "conflicting", "phone", "الشام كاش مرتبط بأكثر من رقم هاتف", "sham_cash", "phone"),
        new("pair_contract_national", "conflicting", "national_id", "رمز العقد مرتبط بأكثر من رقم وطني", "contract_pair", "national_id"),
        new("pair_contract_personal", "conflicting", "personal_no", "رمز العقد مرتبط بأكثر من رقم ذاتي", "contract_pair", "personal_no"),
        new("pair_contract_sham", "conflicting", "sham_cash", "رمز العقد مرتبط بأكثر من شام كاش", "contract_pair", "sham_cash"),
        new("pair_contract_phone", "conflicting", "phone", "رمز العقد مرتبط بأكثر من رقم هاتف", "contract_pair", "phone"),
        new("pair_phone_national", "conflicting", "national_id", "رقم الهاتف مرتبط بأكثر من رقم وطني", "phone", "national_id"),
        new("pair_phone_personal", "conflicting", "personal_no", "رقم الهاتف مرتبط بأكثر من رقم ذاتي", "phone", "personal_no"),
        new("pair_phone_sham", "conflicting", "sham_cash", "رقم الهاتف مرتبط بأكثر من شام كاش", "phone", "sham_cash"),
        new("pair_phone_contract", "conflicting", "contract_pair", "رقم الهاتف مرتبط بأكثر من رمز عقد", "phone", "contract_pair"),
        new("pair_person_contract", "conflicting", "contract_pair", "الشخص مرتبط بأكثر من رمز عقد (أساسي + ثانوي)", "person", "contract_pair"),
        new("pair_person_phone", "conflicting", "phone", "الشخص مرتبط بأكثر من رقم هاتف", "person", "phone"),
    ];

    public static readonly IReadOnlyList<string> Sortable =
    [
        "issueNumber", "fileName", "fullName", "motherName",
        "nationalId", "shamCash", "personalNo", "functionalCategory",
    ];

    public static readonly IReadOnlyDictionary<string, Rule> ByKey =
        Rules.ToDictionary(r => r.Key, StringComparer.Ordinal);

    public static IReadOnlyList<Rule> SelectedRules(string category, string field, string rule)
    {
        var selected = Rules
            .Where(r => r.Category == category
                && (field == "all" || r.Field == field)
                && (rule == "all" || r.Key == rule))
            .ToList();
        if (selected.Count == 0) throw new InvalidOperationException("No matching conflict rules");
        return selected;
    }
}
