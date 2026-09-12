using ExcelArchive.Application.Common;
using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class CategoryRepository(AppDbContext db) : RepositoryBase<Category>(db), ICategoryRepository
{
    public async Task<IReadOnlyList<Category>> ListOrderedAsync(CancellationToken ct = default)
        => await Db.Categories.OrderBy(x => x.SortOrder).ThenBy(x => x.CreatedAt).ToListAsync(ct);

    public Task<bool> NameExistsAsync(string name, Guid? exceptId = null, CancellationToken ct = default)
        => exceptId.HasValue
            ? Db.Categories.AnyAsync(x => x.Name == name && x.Id != exceptId.Value, ct)
            : Db.Categories.AnyAsync(x => x.Name == name, ct);

    public Task<int?> MaxSortOrderAsync(CancellationToken ct = default)
        => Db.Categories.MaxAsync(x => (int?)x.SortOrder, ct);

    public async Task AddAsync(Category category, CancellationToken ct = default)
    {
        Db.Categories.Add(category);
        await SaveAsync(ct);
    }

    public async Task SaveAsync(CancellationToken ct = default)
    {
        try
        {
            await Db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            throw new InvalidOperationException("توجد فئة بهذا الاسم بالفعل.");
        }
    }
}
