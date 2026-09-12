using ExcelArchive.Domain.Enums;

namespace ExcelArchive.Domain.Text;

/// <summary>Canonical snake_case keys for the 14 standard fields (V1 types.ts order).</summary>
public static class StandardFieldKeys
{
    public static readonly string[] All =
    [
        "first_name", "father_name", "last_name", "full_name", "national_id",
        "sham_cash", "personal_no", "mother_name", "phone", "contract_code",
        "secondary_contract_code", "job_title", "functional_category", "organizational_level",
    ];

    private static readonly Dictionary<string, StandardField> ByKey = new(StringComparer.Ordinal)
    {
        ["first_name"] = StandardField.FirstName,
        ["father_name"] = StandardField.FatherName,
        ["last_name"] = StandardField.LastName,
        ["full_name"] = StandardField.FullName,
        ["national_id"] = StandardField.NationalId,
        ["sham_cash"] = StandardField.ShamCash,
        ["personal_no"] = StandardField.PersonalNo,
        ["mother_name"] = StandardField.MotherName,
        ["phone"] = StandardField.Phone,
        ["contract_code"] = StandardField.ContractCode,
        ["secondary_contract_code"] = StandardField.SecondaryContractCode,
        ["job_title"] = StandardField.JobTitle,
        ["functional_category"] = StandardField.FunctionalCategory,
        ["organizational_level"] = StandardField.OrganizationalLevel,
    };

    private static readonly Dictionary<StandardField, string> ByEnum =
        ByKey.ToDictionary(kv => kv.Value, kv => kv.Key);

    public static StandardField? Parse(string? name)
        => string.IsNullOrWhiteSpace(name) || !ByKey.TryGetValue(name.Trim(), out var f) ? null : f;

    public static string? Key(StandardField field)
        => ByEnum.TryGetValue(field, out var k) ? k : null;
}
