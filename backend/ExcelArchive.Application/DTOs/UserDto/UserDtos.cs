namespace ExcelArchive.Application.DTOs.UserDto;

public record UserDto(Guid Id, string Username, string? DisplayName, bool IsActive, DateTime CreatedAt,
    IReadOnlyList<PermissionAssignmentDto> Permissions);

public record PermissionAssignmentDto(string Permission, Guid? GroupId, Guid? FileId);
public record CreateUserRequest(string Username, string Password, string? DisplayName, bool IsActive = true,
    IReadOnlyList<PermissionAssignmentDto> Permissions = null!);

/// <summary>V1 PATCH presence semantics: DisplayNameSet distinguishes an
/// absent displayName (leave untouched) from explicit null/blank (clear it);
/// a null IsActive leaves the flag untouched.</summary>
public record UpdateUserRequest(string? DisplayName, bool DisplayNameSet, bool? IsActive, string? Password = null);
public record ReplacePermissionsRequest(IReadOnlyList<PermissionAssignmentDto> Permissions);
public record UserPermissionsDto(Guid UserId, string Username, IReadOnlyList<PermissionAssignmentDto> Permissions);
