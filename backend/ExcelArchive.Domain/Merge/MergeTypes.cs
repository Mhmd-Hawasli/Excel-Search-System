namespace ExcelArchive.Domain.Merge;

/// <summary>
/// Two-file merge contracts ported from V1 lib/merge/types.ts.
/// This tool never reads/writes archive records. Frozen V1 parity.
/// </summary>
public static class MergeFields
{
    public static readonly IReadOnlyList<string> Keys =
    [
        "fullName", "firstName", "fatherName", "lastName", "motherName",
        "nationalId", "personalNo", "shamCash", "phone",
    ];

    public static readonly IReadOnlyDictionary<string, string> Labels =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["fullName"] = "الاسم الثلاثي",
            ["firstName"] = "الاسم",
            ["fatherName"] = "اسم الأب",
            ["lastName"] = "النسبة",
            ["motherName"] = "اسم الأم",
            ["nationalId"] = "الرقم الوطني",
            ["personalNo"] = "الرقم الذاتي",
            ["shamCash"] = "الشام كاش",
            ["phone"] = "رقم الهاتف",
        };
}

public static class MergeRules
{
    public static readonly IReadOnlyList<string> Keys =
    [
        "full_name", "composed_name", "national_id",
        "personal_no", "sham_cash", "phone",
    ];

    public sealed record Definition(
        string Key, int Order, string Label, string Method,
        string Description, IReadOnlyList<string> Required);

    public static readonly IReadOnlyList<Definition> All =
    [
        new("full_name", 1,
            "القاعدة الأولى — الربط بالاسم الثلاثي مع التأكد باسم الأم",
            "مطابقة عن طريق الاسم الثلاثي",
            "شرطها ظهور الاسم الثلاثي مرة واحدة فقط في الملف الواحد. يُقارن الاسم الثلاثي بعد التنميط، والتأكد بمقارنة الكلمة الأولى من اسم الأم.",
            ["fullName"]),
        new("composed_name", 2,
            "القاعدة الثانية — دمج الاسم مع اسم الأب مع النسبة",
            "مطابقة عن طريق الاسم واسم الأب والنسبة",
            "تُطبَّق على الأسطر التي لم يرتبط اسمها الثلاثي: يُكوَّن الاسم الثلاثي من الاسم + اسم الأب + النسبة ويُربط بالاسم الثلاثي في الجدول الآخر أو بالاسم المكوَّن إن كان غير مربوط، بشرط ظهوره مرة واحدة فقط في الملف الواحد، مع التأكد باسم الأم.",
            ["fullName", "firstName", "fatherName", "lastName"]),
        new("national_id", 3,
            "القاعدة الثالثة — الربط بالرقم الوطني",
            "مطابقة عن طريق الرقم الوطني",
            "شرطها ظهور الرقم الوطني مرة واحدة فقط في الملف الواحد. يُقارن الرقم بعد تحويل الأرقام العربية وحذف الفراغات، والتأكد بالكلمة الأولى من الاسم الثلاثي، أو من الاسم عند غياب عمود الاسم الثلاثي. لا تُربط الصفوف بلا تأكد مطابق.",
            ["nationalId"]),
        new("personal_no", 4,
            "القاعدة الرابعة — الربط بالرقم الذاتي",
            "مطابقة عن طريق الرقم الذاتي",
            "شرطها ظهور الرقم الذاتي مرة واحدة فقط في الملف الواحد. يُقارن الرقم بعد تحويل الأرقام العربية وحذف الفراغات، والتأكد بالكلمة الأولى من الاسم الثلاثي، أو من الاسم عند غياب عمود الاسم الثلاثي. لا تُربط الصفوف بلا تأكد مطابق.",
            ["personalNo"]),
        new("sham_cash", 5,
            "القاعدة الخامسة — الربط بالشام كاش",
            "مطابقة عن طريق الشام كاش",
            "شرطها ظهور الشام كاش مرة واحدة فقط في الملف الواحد. يُقارن الرقم بعد تحويل الأرقام العربية وحذف الفراغات، والتأكد بالكلمة الأولى من الاسم الثلاثي، أو من الاسم عند غياب عمود الاسم الثلاثي. لا تُربط الصفوف بلا تأكد مطابق.",
            ["shamCash"]),
        new("phone", 6,
            "القاعدة السادسة — الربط برقم الهاتف",
            "مطابقة عن طريق رقم الهاتف",
            "شرطها ظهور رقم الهاتف مرة واحدة فقط في الملف الواحد. يُقارن الرقم بعد تحويل الأرقام العربية وحذف الفراغات، والتأكد بالكلمة الأولى من الاسم الثلاثي، أو من الاسم عند غياب عمود الاسم الثلاثي. لا تُربط الصفوف بلا تأكد مطابق.",
            ["phone"]),
    ];

    public static Definition ByKey(string key)
        => All.First(d => d.Key == key);
}

public sealed class MergeRow
{
    public int RowNumber { get; set; }
    public List<string> Cells { get; set; } = [];
    public string? Key { get; set; }
    public string? Rule { get; set; }
    public bool Confirmed { get; set; }
}

public sealed record MergeMapping(IReadOnlyDictionary<string, int> Fields)
{
    public int? Field(string name)
        => Fields.TryGetValue(name, out var i) ? i : null;

    public static MergeMapping From(IReadOnlyDictionary<string, int> fields)
    {
        foreach (var kv in fields)
        {
            if (!MergeFields.Keys.Contains(kv.Key))
                throw new ArgumentException($"حقل غير معروف: {kv.Key}.");
            if (kv.Value < 0)
                throw new ArgumentException("بيانات الربط غير صالحة. تأكد من تحديد الأعمدة بشكل صحيح.");
        }
        if (fields.Values.Distinct().Count() != fields.Count)
            throw new ArgumentException("لا يمكن ربط حقلين بنفس العمود.");
        return new MergeMapping(new Dictionary<string, int>(fields, StringComparer.Ordinal));
    }

    public static MergeMapping Empty => new(new Dictionary<string, int>(StringComparer.Ordinal));
}

public sealed record MatchPair(
    string Key, string Rule,
    int LeftRowNumber, int RightRowNumber,
    bool Confirmed, string LeftValue, string RightValue);

public sealed record RuleStat(
    string Key, int Order, string Label, string Description,
    bool Available, string? Reason, int MatchedPairs, List<MatchPair> Pairs);

public sealed record MergeStatus(string State, int MatchedPairs, int Total, double Percent);

public sealed record MergeTableInput(
    IReadOnlyList<string> Headers,
    IReadOnlyList<MergeRowInput> Rows,
    MergeMapping Mapping);

public sealed record MergeRowInput(int RowNumber, IReadOnlyList<string> Cells);

public sealed record MergeResult(
    List<MergeRow> Left, List<MergeRow> Right,
    List<MatchPair> Pairs, List<RuleStat> Rules, MergeStatus Status);

public static class MergeExportNames
{
    public const string KeyHeader = "مفتاح الربط";
    public const string ConfirmHeader = "التأكد";
    public const string ConfirmedText = "مؤكد";
    public const string UnconfirmedText = "غير مؤكد";
    public static readonly IReadOnlyList<string> SheetNames = ["الدمج الكامل", "الجدول A", "الجدول B"];
}
