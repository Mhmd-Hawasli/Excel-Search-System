using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IGroupRepository : IRepositoryBase<Group>
{
    Task<IReadOnlyList<Group>> ListScopedAsync(IReadOnlyList<Guid>? groupIds, CancellationToken ct = default);
    Task<Group?> FindScopedAsync(Guid id, IReadOnlyList<Guid>? groupIds, CancellationToken ct = default);
    Task<Group?> FindWithFilesAsync(Guid id, CancellationToken ct = default);
    Task<bool> NameExistsAsync(string name, Guid? exceptId = null, CancellationToken ct = default);
    Task<int?> MaxSortOrderAsync(CancellationToken ct = default);
    Task<IReadOnlyList<Group>> ListOrderedAsync(CancellationToken ct = default);
    Task<int> CountByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default);
    Task AddAsync(Group group, CancellationToken ct = default);
    Task SaveAsync(CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> AllIdsAsync(CancellationToken ct = default);
}
