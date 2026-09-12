using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Domain.Records;

/// <summary>
/// Single home for record shadow-column computation (sf_*/n_*/d_* + NationalIdNum).
/// Import, mapping recompute, and manual edits must all agree, so they share this.
/// Semantics mirror V1 import-worker.ts.
/// </summary>
public static class RecordShadowMapper
{
    public static void Clear(Record r)
    {
        r.SfFirstName = null;
        r.SfFatherName = null;
        r.SfLastName = null;
        r.SfFullName = null;
        r.SfNationalId = null;
        r.SfShamCash = null;
        r.SfPersonalNo = null;
        r.SfMotherName = null;
        r.SfPhone = null;
        r.SfContractCode = null;
        r.SfSecondaryContractCode = null;
        r.SfJobTitle = null;
        r.SfFunctionalCategory = null;
        r.SfOrganizationalLevel = null;
        r.NFirstName = null;
        r.NFatherName = null;
        r.NLastName = null;
        r.NFullName = null;
        r.NMotherName = null;
        r.NContractCode = null;
        r.NSecondaryContractCode = null;
        r.NJobTitle = null;
        r.NOrganizationalLevel = null;
        r.DNationalId = null;
        r.DPersonalNo = null;
        r.DPhone = null;
        r.NationalIdNum = null;
    }

    public static void Apply(Record record, IReadOnlyDictionary<StandardField, string?> byField)
    {
        // V1 recordInput semantics: sf_* keep the raw mapped value ("" stays "",
        // missing stays null — never trimmed here); n_*/d_* apply only to
        // non-empty values (JS truthiness: "" is falsy, whitespace is truthy).
        string? Get(StandardField f) => byField.TryGetValue(f, out var v) ? v : null;
        var first = Get(StandardField.FirstName);
        var father = Get(StandardField.FatherName);
        var last = Get(StandardField.LastName);
        var full = Get(StandardField.FullName);
        if (string.IsNullOrEmpty(full) &&
            (!string.IsNullOrEmpty(first) || !string.IsNullOrEmpty(father) || !string.IsNullOrEmpty(last)))
            full = string.Join(" ", new[] { first, father, last }.Where(p => !string.IsNullOrWhiteSpace(p?.Trim())));

        var (sfNat, dNat, natNum) = ArabicNormalizer.NationalIdColumns(Get(StandardField.NationalId) ?? "");

        record.SfFirstName = first;
        record.SfFatherName = father;
        record.SfLastName = last;
        record.SfFullName = full;
        record.SfNationalId = sfNat;
        record.SfShamCash = ShamCash.AsBigInt(Get(StandardField.ShamCash) ?? "");
        record.SfPersonalNo = Get(StandardField.PersonalNo);
        record.SfMotherName = Get(StandardField.MotherName);
        record.SfPhone = Get(StandardField.Phone);
        record.SfContractCode = Get(StandardField.ContractCode);
        record.SfSecondaryContractCode = Get(StandardField.SecondaryContractCode);
        record.SfJobTitle = Get(StandardField.JobTitle);
        record.SfFunctionalCategory = FunctionalCategory.Parse(Get(StandardField.FunctionalCategory) ?? "");
        record.SfOrganizationalLevel = Get(StandardField.OrganizationalLevel);
        record.NFirstName = NormOrNull(first);
        record.NFatherName = NormOrNull(father);
        record.NLastName = NormOrNull(last);
        record.NFullName = NormOrNull(full);
        record.NMotherName = NormOrNull(Get(StandardField.MotherName));
        record.NContractCode = NormOrNull(Get(StandardField.ContractCode));
        record.NSecondaryContractCode = NormOrNull(Get(StandardField.SecondaryContractCode));
        record.NJobTitle = NormOrNull(Get(StandardField.JobTitle));
        record.NOrganizationalLevel = NormOrNull(Get(StandardField.OrganizationalLevel));
        record.DNationalId = dNat;
        record.DPersonalNo = DigitsOrNull(Get(StandardField.PersonalNo));
        record.DPhone = DigitsOrNull(Get(StandardField.Phone));
        record.NationalIdNum = natNum;
    }

    /// <summary>Builds the field map from ordered columns + values (last duplicate wins, like import).</summary>
    public static Dictionary<StandardField, string?> ByFieldMap(IReadOnlyList<FileColumn> columns, IReadOnlyList<string> values)
    {
        var map = new Dictionary<StandardField, string?>();
        for (var i = 0; i < columns.Count && i < values.Count; i++)
            if (columns[i].StandardField.HasValue)
                map[columns[i].StandardField!.Value] = values[i] ?? "";
        return map;
    }

    private static string? NormOrNull(string? v) => string.IsNullOrEmpty(v) ? null : ArabicNormalizer.NormalizeStored(v);
    private static string? DigitsOrNull(string? v) => string.IsNullOrEmpty(v) ? null : ArabicNormalizer.DigitsOnly(v);
}
