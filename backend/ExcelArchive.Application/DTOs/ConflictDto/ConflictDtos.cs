namespace ExcelArchive.Application.DTOs.ConflictDto;

public record IgnoreConflictRequest(string Rule, Guid RecordId);
public record IgnoreConflictResponse(bool Ok);

/// <summary>V1 ConflictIssue shape (catalog.ts): one entry per matched rule
/// within a row; rows carry several issues (P4.2+).</summary>
public record ConflictIssueDto(string Rule, string Label, string Explanation);

/// <summary>V1 ConflictRow shape: grouped multi-issue rows with stable
/// groupKey/issueNumber (ROW_NUMBER per-row for invalid/missing, DENSE_RANK
/// over group_key for similar/specific conflicting rules), source identity
/// and display values. Transport contract for P4.2 list + P4.5 export.
/// </summary>
public record ConflictRowDto(
    Guid Id,
    Guid FileId,
    Guid GroupId,
    string FileName,
    string OriginalFilename,
    int RowIndex,
    string FullName,
    string MotherName,
    string NationalId,
    string ShamCash,
    string PersonalNo,
    string Phone,
    int? FunctionalCategory,
    string? GroupKey,
    int IssueNumber,
    IReadOnlyList<ConflictIssueDto> Issues);

/// <summary>V1 ConflictResponse shape: rows/total/page/pageSize/pageCount.
/// </summary>
public record ConflictListResult(
    IReadOnlyList<ConflictRowDto> Rows, long Total, int Page, int PageSize, int PageCount);

/// <summary>V1 ConflictStats shape (query.ts): global instances/records,
/// scanned files/records, ignored count, per-rule and top-50 file stats.</summary>
public record ConflictStatsRuleDto(
    string Rule, string Label, string Category, int Instances, int Records);

public record ConflictStatsFileDto(
    Guid FileId, string FileName, Guid GroupId, int Instances);

public record ConflictStatsDto(
    int Instances, int Records, int FilesScanned, int RecordsScanned, int Ignored,
    IReadOnlyList<ConflictStatsRuleDto> Rules, IReadOnlyList<ConflictStatsFileDto> Files)
{
    public static readonly ConflictStatsDto Empty = new(0, 0, 0, 0, 0, [], []);
};
