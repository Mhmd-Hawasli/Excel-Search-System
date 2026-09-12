namespace ExcelArchive.Application.Interfaces.Caching;

/// <summary>
/// Revisioned conflict-query cache. Scoped: shares the request DbContext.
/// Key building stays deterministic; stale results are never republished.
/// </summary>
public interface IConflictCacheService
{
    Task<T?> GetAsync<T>(string key, DateOnly today, CancellationToken ct = default);
    Task EnsureStateAsync(CancellationToken ct = default);
    Task<long> RevisionAsync(CancellationToken ct = default);
    Task<T> GetOrComputeAsync<T>(string key, DateOnly today, Func<Task<T>> compute, CancellationToken ct = default)
        where T : class;
    Task PruneAsync(DateOnly today, CancellationToken ct = default);
}
