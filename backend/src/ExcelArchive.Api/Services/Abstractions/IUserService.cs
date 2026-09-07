using ExcelArchive.Api.DTOs.Users;

namespace ExcelArchive.Api.Services.Abstractions;

public interface IUserService
{
    Task<IReadOnlyList<UserDto>> ListAsync(CancellationToken ct = default);
    Task<UserDto?> GetAsync(Guid id, CancellationToken ct = default);
    Task<UserDto> CreateAsync(CreateUserRequest request, string actorUsername, CancellationToken ct = default);
    Task<UserDto> UpdateAsync(Guid id, UpdateUserRequest request, string actorUsername, CancellationToken ct = default);
    Task DeleteAsync(Guid id, string actorUsername, CancellationToken ct = default);
    Task<UserPermissionsDto> ReplacePermissionsAsync(Guid id, ReplacePermissionsRequest request, string actorUsername, CancellationToken ct = default);
}
