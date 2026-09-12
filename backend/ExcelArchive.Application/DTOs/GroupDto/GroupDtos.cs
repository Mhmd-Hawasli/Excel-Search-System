namespace ExcelArchive.Application.DTOs.GroupDto;

public record GroupDto(Guid Id, string Name, string Description, int SortOrder, DateTime CreatedAt, DateTime UpdatedAt, int FileCount = 0, long RecordCount = 0);
public record CreateGroupRequest(string Name, string Description = "");
public record UpdateGroupRequest(string Name, string Description = "");
public record ReorderGroupRequest(Guid Id, string Direction);
public record DeleteGroupRequest(Guid Id, string ConfirmName);

/// <summary>File row for group detail / dashboard recent files (docs/05).</summary>
public record GroupFileDto(
    Guid Id,
    Guid GroupId,
    string Name,
    string Description,
    string OriginalFilename,
    int RowCount,
    int ColumnCount,
    int Version,
    DateTime UploadedAt,
    string? GroupName = null,
    bool HasEdits = false);

public record GroupDetailDto(GroupDto Group, IReadOnlyList<GroupFileDto> Files);
