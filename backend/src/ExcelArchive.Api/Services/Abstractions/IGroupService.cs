using ExcelArchive.Api.DTOs.Groups;

namespace ExcelArchive.Api.Services.Abstractions;

public interface IGroupService
{
    Task<IReadOnlyList<GroupDto>> ListAsync(CancellationToken ct = default);
    Task<GroupDto?> GetAsync(Guid id, CancellationToken ct = default);
    Task<GroupDto> CreateAsync(CreateGroupRequest request, string actorUsername, CancellationToken ct = default);
    Task<GroupDto> UpdateAsync(Guid id, UpdateGroupRequest request, string actorUsername, CancellationToken ct = default);
    Task ReorderAsync(Guid id, string direction, string actorUsername, CancellationToken ct = default);
    Task DeleteAsync(Guid id, string confirmName, string actorUsername, CancellationToken ct = default);
}
