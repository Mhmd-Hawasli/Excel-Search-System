using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Repositories;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class FileColumnRepository(AppDbContext db) : RepositoryBase<FileColumn>(db), IFileColumnRepository
{
    public async Task<IReadOnlyList<FileColumn>> ListOrderedWithGraphAsync(CancellationToken ct = default)
        => await Db.FileColumns.AsNoTracking()
            .Include(c => c.File).ThenInclude(f => f.Group)
            .OrderBy(c => c.SortOrder).ThenBy(c => c.CreatedAt).ThenBy(c => c.ColumnIndex)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<FileColumn>> ListByCategoryAsync(Guid? categoryId, CancellationToken ct = default)
        => await Db.FileColumns
            .Where(c => c.CategoryId == categoryId)
            .OrderBy(c => c.SortOrder).ThenBy(c => c.CreatedAt)
            .ToListAsync(ct);

    public Task<FileColumn?> FindWithGraphAsync(Guid id, CancellationToken ct = default)
        => Db.FileColumns.Include(c => c.File).Include(c => c.Category)
            .FirstOrDefaultAsync(x => x.Id == id, ct);

    public async Task<IReadOnlyList<FileColumn>> ListByFileAsync(Guid fileId, CancellationToken ct = default)
        => await Db.FileColumns.AsNoTracking().Where(c => c.FileId == fileId).ToListAsync(ct);

    public async Task<IReadOnlyList<(Guid Id, StandardField? Standard)>> ListKeysByCategoryAsync(Guid? categoryId, CancellationToken ct = default)
        => await Db.FileColumns
            .Where(c => c.CategoryId == categoryId)
            .Select(c => new { c.Id, c.StandardField })
            .ToListAsync(ct)
            .ContinueWith(t => (IReadOnlyList<(Guid, StandardField?)>)t.Result.Select(x => (x.Id, x.StandardField)).ToList(), ct);

    public Task<int?> MaxSortOrderAsync(Guid? categoryId, CancellationToken ct = default)
        => Db.FileColumns.Where(c => c.CategoryId == categoryId).MaxAsync(c => (int?)c.SortOrder, ct);

    public Task<int?> FirstSortOrderAsync(Guid? categoryId, StandardField standard, CancellationToken ct = default)
        => Db.FileColumns
            .Where(c => c.CategoryId == categoryId && c.StandardField == standard)
            .OrderBy(c => c.SortOrder).ThenBy(c => c.CreatedAt)
            .Select(c => (int?)c.SortOrder)
            .FirstOrDefaultAsync(ct);
}
