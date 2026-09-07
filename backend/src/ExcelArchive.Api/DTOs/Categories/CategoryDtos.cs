namespace ExcelArchive.Api.DTOs.Categories;

public record CategoryDto(Guid Id, string Name, int SortOrder, DateTime CreatedAt);
public record CreateCategoryRequest(string Name);
public record UpdateCategoryRequest(string Name);
public record MoveColumnRequest(Guid ColumnId, Guid? CategoryId);
public record ReorderColumnGroupsRequest(IReadOnlyList<Guid> ColumnIds, IReadOnlyList<Guid> CategoryIds);
public record ReorderCategoryRequest(Guid Id, string Direction);
public record DeleteCategoryRequest(Guid Id, string ConfirmName);
