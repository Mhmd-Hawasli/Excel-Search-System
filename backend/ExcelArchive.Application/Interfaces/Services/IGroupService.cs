using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.GroupDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface IGroupService
{
    Task<IReadOnlyList<GroupDto>> ListAsync(DataScopeDto scope, CancellationToken ct = default);
    Task<GroupDto?> GetAsync(Guid id, DataScopeDto scope, CancellationToken ct = default);
    Task<GroupDetailDto?> GetDetailAsync(Guid id, CurrentUserDto user, CancellationToken ct = default);
    Task<GroupDto> CreateAsync(CreateGroupRequest request, string actorUsername, CancellationToken ct = default);
    Task<GroupDto> UpdateAsync(Guid id, UpdateGroupRequest request, string actorUsername, CancellationToken ct = default);
    Task ReorderAsync(Guid id, string direction, string actorUsername, CancellationToken ct = default);
    Task DeleteAsync(Guid id, string confirmName, string actorUsername, CancellationToken ct = default);
}
