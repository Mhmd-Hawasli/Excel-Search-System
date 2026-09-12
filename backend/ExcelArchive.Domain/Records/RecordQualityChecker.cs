using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Domain.Records;

/// <summary>
/// Row-local data-quality checks shared by import and manual edits.
/// Duplicate-national detection stays import-only (it needs the file-wide seen set).
/// </summary>
public static class RecordQualityChecker
{
    public static List<DataQualityIssue> CheckRow(
        Guid fileId,
        int rowIndex,
        IReadOnlyDictionary<StandardField, (string Header, string Value)> fields,
        bool rowHasValue)
    {
        var issues = new List<DataQualityIssue>();
        if (!rowHasValue)
        {
            issues.Add(new DataQualityIssue { FileId = fileId, RowIndex = rowIndex, IssueType = DataQualityIssueType.EmptyRow });
            return issues;
        }

        string Value(StandardField f) => fields.TryGetValue(f, out var hv) ? hv.Value : "";

        var nationalRaw = Value(StandardField.NationalId);
        var nationalIssue = ArabicNormalizer.NationalIdIssue(nationalRaw);
        if (nationalIssue is not null)
        {
            issues.Add(new DataQualityIssue
            {
                FileId = fileId,
                RowIndex = rowIndex,
                IssueType = nationalIssue == "missing"
                    ? DataQualityIssueType.MissingNationalId
                    : DataQualityIssueType.InvalidNationalId,
                ColumnName = "الرقم الوطني",
                RawValue = nationalRaw,
            });
        }

        var phoneRaw = Value(StandardField.Phone);
        var phoneDigits = ArabicNormalizer.DigitsOnly(phoneRaw);
        if (!string.IsNullOrWhiteSpace(phoneRaw) && (phoneDigits.Length < 7 || phoneDigits.Length > 15))
        {
            issues.Add(new DataQualityIssue
            {
                FileId = fileId,
                RowIndex = rowIndex,
                IssueType = DataQualityIssueType.InvalidPhone,
                ColumnName = "رقم الهاتف",
                RawValue = phoneRaw,
            });
        }

        var shamRaw = Value(StandardField.ShamCash);
        if (!string.IsNullOrWhiteSpace(shamRaw) && ShamCash.Normalize(shamRaw) is null)
        {
            issues.Add(new DataQualityIssue
            {
                FileId = fileId,
                RowIndex = rowIndex,
                IssueType = DataQualityIssueType.InvalidShamCash,
                ColumnName = "الشام كاش",
                RawValue = shamRaw,
            });
        }

        var funcRaw = Value(StandardField.FunctionalCategory);
        if (!string.IsNullOrWhiteSpace(funcRaw) && FunctionalCategory.Parse(funcRaw) == FunctionalCategory.Error)
        {
            issues.Add(new DataQualityIssue
            {
                FileId = fileId,
                RowIndex = rowIndex,
                IssueType = DataQualityIssueType.InvalidFunctionalCategory,
                ColumnName = "الفئة الوظيفية",
                RawValue = funcRaw,
            });
        }

        return issues;
    }
}
