using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IUserRepository : IRepositoryBase<User>
{
    Task<User?> FindByUsernameAsync(string username, CancellationToken ct = default);
    Task<User?> FindWithPermissionsAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<User>> ListWithPermissionsAsync(CancellationToken ct = default);
    Task<bool> UsernameExistsAsync(string username, CancellationToken ct = default);
    Task<IReadOnlyList<UserPermission>> ListPermissionsAsync(Guid userId, CancellationToken ct = default);
    Task ReplacePermissionsAsync(Guid userId, IReadOnlyList<UserPermission> permissions, CancellationToken ct = default);
    Task AddUserAsync(User user, CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> AllIdsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<string>> AllUsernamesAsync(CancellationToken ct = default);
}
