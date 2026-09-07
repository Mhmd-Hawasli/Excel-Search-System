using System.Linq.Expressions;

namespace ExcelArchive.Api.Repositories;

public interface IRepository<T> where T : class
{
    Task<T?> FindAsync(Guid id, CancellationToken ct = default);
    Task<T?> FirstOrDefaultAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default);
    Task<List<T>> ListAsync(Expression<Func<T, bool>>? predicate = null, CancellationToken ct = default);
    Task<int> CountAsync(Expression<Func<T, bool>>? predicate = null, CancellationToken ct = default);
    T Add(T entity);
    void Update(T entity);
    void Remove(T entity);
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
