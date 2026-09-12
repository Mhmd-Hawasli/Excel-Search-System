using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IFileColumnRepository : IRepositoryBase<FileColumn>
{
    Task<IReadOnlyList<FileColumn>> ListOrderedWithGraphAsync(CancellationToken ct = default);
    Task<IReadOnlyList<FileColumn>> ListByCategoryAsync(Guid? categoryId, CancellationToken ct = default);
    Task<FileColumn?> FindWithGraphAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<FileColumn>> ListByFileAsync(Guid fileId, CancellationToken ct = default);
    Task<IReadOnlyList<(Guid Id, StandardField? Standard)>> ListKeysByCategoryAsync(Guid? categoryId, CancellationToken ct = default);
    Task<int?> MaxSortOrderAsync(Guid? categoryId, CancellationToken ct = default);
    Task<int?> FirstSortOrderAsync(Guid? categoryId, StandardField standard, CancellationToken ct = default);
}
