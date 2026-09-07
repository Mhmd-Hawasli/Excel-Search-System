namespace ExcelArchive.Api.DTOs.Auth;

public record LoginRequest(string Username, string Password);
public record LoginResponse(bool Ok, string Username);
public record CurrentUserDto(Guid Id, string Username, string? DisplayName, IReadOnlyList<PermissionDto> Permissions);
public record PermissionDto(string Permission, Guid? GroupId, Guid? FileId);
