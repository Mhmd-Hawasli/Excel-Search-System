namespace ExcelArchive.Api.DTOs.Edits;

public record EditedFileSummary(Guid FileId, string FileName, Guid GroupId, string GroupName, int EditCount, DateTime LastEditAt);
public record EditDto(Guid Id, Guid RecordId, Guid FileId, Guid? FileColumnId, string HeaderRaw, string OldValue, string NewValue, DateTime CreatedAt);
public record EditsResult(IReadOnlyList<EditDto> Items, int Total, int Page, int PageSize);
public record RevertEditRequest(Guid EditId, string NewValue);
public record VisitRecordRequest(Guid RecordId);
