namespace ExcelArchive.Application.DTOs.SearchDto;

public record SearchResultRow(
    Guid Id,
    Guid GroupId,
    string GroupName,
    Guid FileId,
    string FileName,
    string? SfFullName,
    string? SfNationalId,
    string? DNationalId,
    string? SfMotherName,
    string? SfShamCash,
    string? SfPersonalNo,
    string? SfFirstName,
    string? SfFatherName,
    string? SfLastName,
    string? SfPhone,
    string? SfContractCode,
    string? SfSecondaryContractCode,
    string? SfJobTitle,
    int? SfFunctionalCategory,
    string? SfOrganizationalLevel,
    string? MatchedField,
    string? MatchedValue,
    int MatchRank);

public record SearchResultSet(
    IReadOnlyList<SearchResultRow> Rows,
    long Total,
    int Page,
    int PageSize,
    int PageCount);
