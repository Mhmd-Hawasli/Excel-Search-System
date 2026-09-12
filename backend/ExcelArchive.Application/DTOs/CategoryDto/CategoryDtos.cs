namespace ExcelArchive.Application.DTOs.CategoryDto;

public record CategoryDto(Guid Id, string Name, int SortOrder, DateTime CreatedAt);
public record CreateCategoryRequest(string Name);
public record UpdateCategoryRequest(string Name);
public record MoveColumnRequest(Guid ColumnId, Guid? CategoryId);
public record ReorderCategoryRequest(Guid Id, string Direction);
public record DeleteCategoryRequest(Guid Id, string ConfirmName);
public record ReorderColumnGroupsRequest(Guid? CategoryId, List<string> OrderedGroupKeys);

public record BoardColumnDto(Guid Id, string HeaderRaw, int ColumnIndex, Guid FileId, string FileName, string GroupName);
public record ColumnGroupDto(string Key, string Label, string? StandardField, IReadOnlyList<BoardColumnDto> Columns);
public record CategoryBoardDto(Guid? CategoryId, string CategoryName, IReadOnlyList<ColumnGroupDto> Groups);
