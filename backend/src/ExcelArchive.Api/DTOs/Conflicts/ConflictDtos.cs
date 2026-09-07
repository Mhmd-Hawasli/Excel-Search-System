namespace ExcelArchive.Api.DTOs.Conflicts;

public record ConflictQueryRequest(
    string? Category = "all", string? Field = "all", string? Rule = "all", int Page = 1, int PageSize = 50,
    IReadOnlyList<Guid>? GroupIds = null, IReadOnlyList<Guid>? FileIds = null);

public record ConflictRow(
    Guid RecordId, Guid FileId, string FileName, Guid GroupId, string GroupName,
    int RowIndex, string? FullName, string? MotherName, string? NationalId,
    IReadOnlyList<string> Fields, string Rule, string Description);

public record ConflictsResult(IReadOnlyList<ConflictRow> Rows, int Total, int Page, int PageSize, DateTime GeneratedAt);

public record IgnoreConflictRequest(string Rule, Guid RecordId);
public record IgnoreConflictResponse(bool Ok);
