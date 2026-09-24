namespace ExcelArchive.Application.DTOs.GroupDto;

public record GroupDto(Guid Id, string Name, string Description, int SortOrder, DateTime CreatedAt, DateTime UpdatedAt, int FileCount = 0, long RecordCount = 0, bool IncludeInDefaultSearch = true,
    // Private-group markers (additive, default off): owners and
    // groups.viewPrivate holders only ever receive true values here —
    // everyone else never sees the row at all.
    bool IsPrivate = false, string? OwnerUsername = null, Guid? OwnerUserId = null);
public record CreateGroupRequest(string Name, string Description = "", bool IncludeInDefaultSearch = true, bool IsPrivate = false);
public record UpdateGroupRequest(string Name, string Description = "", bool? IncludeInDefaultSearch = null);
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
