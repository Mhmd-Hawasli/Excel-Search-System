namespace ExcelArchive.Domain.Enums;

public enum DataQualityIssueType
{
    MissingNationalId,
    InvalidNationalId,
    DuplicateNationalId,
    InvalidPhone,
    InvalidShamCash,
    InvalidFunctionalCategory,
    EmptyRow,
}
