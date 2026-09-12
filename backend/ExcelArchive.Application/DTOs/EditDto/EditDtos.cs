namespace ExcelArchive.Application.DTOs.EditDto;

public record EditedFileSummary(Guid FileId, string FileName, Guid GroupId, string GroupName, int EditCount, DateTime LastEditAt);
public record EditDto(Guid Id, Guid RecordId, Guid FileId, Guid? FileColumnId, string HeaderRaw, string OldValue, string NewValue, DateTime CreatedAt, string? PersonName = null, int? RowIndex = null);
public record EditsResult(IReadOnlyList<EditDto> Items, int Total, int Page, int PageSize);
public record RevertEditRequest(Guid EditId, string NewValue);
public record VisitRecordRequest(Guid RecordId);

/// <summary>V1 lib/edits/service getRecordEdits shape: newest-first list plus
/// per-header summary where OriginalValue is the true Excel original
/// (oldest-first pass) and LastValue wins.</summary>
public record RecordEditInfoDto(Guid Id, string HeaderRaw, Guid? FileColumnId, string OldValue, string NewValue, DateTime CreatedAt);
public record EditedHeaderDto(int Count, string OriginalValue, string LastValue, DateTime LastAt);
public record RecordEditsResult(IReadOnlyList<RecordEditInfoDto> Edits, IReadOnlyDictionary<string, EditedHeaderDto> EditedHeaders);
public record EditResult(bool Changed, string OldValue, string NewValue);
