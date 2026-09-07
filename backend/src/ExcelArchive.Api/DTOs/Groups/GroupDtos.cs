namespace ExcelArchive.Api.DTOs.Groups;

public record GroupDto(Guid Id, string Name, string Description, int SortOrder, DateTime CreatedAt, DateTime UpdatedAt);
public record CreateGroupRequest(string Name, string Description = "");
public record UpdateGroupRequest(string Name, string Description = "");
public record ReorderGroupRequest(Guid Id, string Direction);
public record DeleteGroupRequest(Guid Id, string ConfirmName);
