namespace ExcelArchive.Application.DTOs.EditDto;

public record EditedFileSummary(Guid FileId, string FileName, Guid GroupId, string GroupName, int EditCount, DateTime LastEditAt, int CurrentVersion = 1);
public record EditDto(Guid Id, Guid? RecordId, Guid FileId, Guid? FileColumnId, string HeaderRaw, string OldValue, string NewValue, DateTime CreatedAt, string? PersonName = null, int? RowIndex = null, string? EditedBy = null, int FileVersion = 1, string? NationalId = null, string? CurrentValue = null, Guid? CurrentRecordId = null);
/// <summary>Filter dropdown values for one file's edit history: exact-match
/// candidates for the column / user multi-selects, plus the file's current
/// version (default of the version stepper).</summary>
public record EditOptionsDto(IReadOnlyList<string> Columns, IReadOnlyList<EditUserOption> Users, int CurrentVersion);
public record EditUserOption(string Username, string? DisplayName);
public record EditsResult(IReadOnlyList<EditDto> Items, int Total, int Page, int PageSize);
public record RevertEditRequest(Guid RecordId, Guid? FileColumnId, string? HeaderRaw);
public record VisitRecordRequest(Guid RecordId);

/// <summary>V1 lib/edits/service getRecordEdits shape: newest-first list plus
/// per-header summary where OriginalValue is the true Excel original
/// (oldest-first pass) and LastValue wins.</summary>
public record RecordEditInfoDto(Guid Id, string HeaderRaw, Guid? FileColumnId, string OldValue, string NewValue, DateTime CreatedAt, string? EditedBy = null);
public record EditedHeaderDto(int Count, string OriginalValue, string LastValue, DateTime LastAt, string? LastBy = null);
public record RecordEditsResult(IReadOnlyList<RecordEditInfoDto> Edits, IReadOnlyDictionary<string, EditedHeaderDto> EditedHeaders);
public record EditResult(bool Changed, string OldValue, string NewValue);
