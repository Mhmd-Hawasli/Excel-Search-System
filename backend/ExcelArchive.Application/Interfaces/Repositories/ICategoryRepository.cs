using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface ICategoryRepository : IRepositoryBase<Category>
{
    Task<IReadOnlyList<Category>> ListOrderedAsync(CancellationToken ct = default);
    Task<bool> NameExistsAsync(string name, Guid? exceptId = null, CancellationToken ct = default);
    Task<int?> MaxSortOrderAsync(CancellationToken ct = default);
    Task AddAsync(Category category, CancellationToken ct = default);
    Task SaveAsync(CancellationToken ct = default);
}
