using System.Linq.Expressions;
using ExcelArchive.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Repositories;

public class RepositoryBase<T>(AppDbContext db) : IRepository<T> where T : class
{
    protected readonly AppDbContext Db = db;
    protected DbSet<T> Set => Db.Set<T>();

    public virtual Task<T?> FindAsync(Guid id, CancellationToken ct = default) => Set.FindAsync([id], ct).AsTask();

    public virtual Task<T?> FirstOrDefaultAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default)
        => Set.FirstOrDefaultAsync(predicate, ct);

    public virtual Task<List<T>> ListAsync(Expression<Func<T, bool>>? predicate = null, CancellationToken ct = default)
        => predicate is null ? Set.ToListAsync(ct) : Set.Where(predicate).ToListAsync(ct);

    public virtual Task<int> CountAsync(Expression<Func<T, bool>>? predicate = null, CancellationToken ct = default)
        => predicate is null ? Set.CountAsync(ct) : Set.CountAsync(predicate, ct);

    public T Add(T entity) => Set.Add(entity).Entity;
    public void Update(T entity) => Set.Update(entity);
    public void Remove(T entity) => Set.Remove(entity);

    public virtual async Task<int> SaveChangesAsync(CancellationToken ct = default) => await Db.SaveChangesAsync(ct);
}
