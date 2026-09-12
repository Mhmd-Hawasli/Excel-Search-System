using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class GroupRepository(AppDbContext db) : RepositoryBase<Group>(db), IGroupRepository
{
    public async Task<IReadOnlyList<Group>> ListScopedAsync(IReadOnlyList<Guid>? groupIds, CancellationToken ct = default)
    {
        var query = Db.Groups.AsNoTracking();
        if (groupIds is not null) query = query.Where(g => groupIds.Contains(g.Id));
        return await query.OrderBy(x => x.SortOrder).ThenBy(x => x.CreatedAt).ToListAsync(ct);
    }

    public Task<Group?> FindScopedAsync(Guid id, IReadOnlyList<Guid>? groupIds, CancellationToken ct = default)
    {
        var query = Db.Groups.AsNoTracking().Where(x => x.Id == id);
        if (groupIds is not null) query = query.Where(g => groupIds.Contains(g.Id));
        return query.FirstOrDefaultAsync(ct);
    }

    public Task<Group?> FindWithFilesAsync(Guid id, CancellationToken ct = default)
        => Db.Groups.Include(g => g.Files).FirstOrDefaultAsync(x => x.Id == id, ct);

    public Task<bool> NameExistsAsync(string name, Guid? exceptId = null, CancellationToken ct = default)
        => exceptId.HasValue
            ? Db.Groups.AnyAsync(x => x.Name == name && x.Id != exceptId.Value, ct)
            : Db.Groups.AnyAsync(x => x.Name == name, ct);

    public Task<int?> MaxSortOrderAsync(CancellationToken ct = default)
        => Db.Groups.MaxAsync(x => (int?)x.SortOrder, ct);

    public async Task<IReadOnlyList<Group>> ListOrderedAsync(CancellationToken ct = default)
        => await Db.Groups.OrderBy(x => x.SortOrder).ThenBy(x => x.CreatedAt).ToListAsync(ct);

    public Task<int> CountByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default)
        => Db.Groups.CountAsync(g => ids.Contains(g.Id), ct);

    public async Task<IReadOnlyList<Guid>> AllIdsAsync(CancellationToken ct = default)
        => await Db.Groups.AsNoTracking().Select(g => g.Id).ToListAsync(ct);

    public async Task AddAsync(Group group, CancellationToken ct = default)
    {
        Db.Groups.Add(group);
        await SaveAsync(ct);
    }

    public async Task SaveAsync(CancellationToken ct = default)
    {
        try
        {
            await Db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            throw new InvalidOperationException("يوجد اسم مجموعة مطابق بالفعل.");
        }
    }

    private static bool IsUniqueViolation(DbUpdateException ex)
        => ex.InnerException is Npgsql.PostgresException pg && pg.SqlState == Npgsql.PostgresErrorCodes.UniqueViolation;
}
