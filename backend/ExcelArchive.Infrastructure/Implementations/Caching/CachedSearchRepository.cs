using System.Security.Cryptography;
using System.Text.Json;
using ExcelArchive.Application.DTOs.SearchDto;
using ExcelArchive.Application.Interfaces.Caching;
using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Infrastructure.Implementations.Repositories;
using Microsoft.Extensions.Caching.Memory;

namespace ExcelArchive.Infrastructure.Implementations.Caching;

/// <summary>Short lived, byte bounded cache for repeated paged archive searches.</summary>
public sealed class SearchResultCacheStore : IDisposable
{
    private const int MaxBytes = 16 * 1024 * 1024;
    private const int MaxEntryBytes = 512 * 1024;
    private readonly MemoryCache cache = new(new MemoryCacheOptions { SizeLimit = MaxBytes });
    private readonly SemaphoreSlim[] gates = Enumerable.Range(0, 64)
        .Select(_ => new SemaphoreSlim(1, 1)).ToArray();

    public bool TryGet(string key, out SearchResultSet? result) => cache.TryGetValue(key, out result);

    public SemaphoreSlim Gate(string key) => gates[(uint)key.GetHashCode() % (uint)gates.Length];

    public void Set(string key, SearchResultSet result)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(result).Length;
        if (bytes > MaxEntryBytes) return;
        cache.Set(key, result, new MemoryCacheEntryOptions
        {
            Size = bytes,
            AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(60),
        });
    }

    public void Dispose()
    {
        cache.Dispose();
        foreach (var gate in gates) gate.Dispose();
    }
}

/// <summary>
/// Checks the database revision on every request. The key includes the
/// authorized file scope, so one user's cached page cannot serve another.
/// </summary>
public sealed class CachedSearchRepository(
    SearchRepository inner,
    IConflictCacheService revisions,
    SearchResultCacheStore store) : ISearchRepository
{
    public async Task<SearchResultSet> ExecuteAsync(
        SearchPlan plan, IReadOnlyList<Guid> groupIds, IReadOnlyList<Guid> fileIds,
        IReadOnlyList<Guid>? allowedFileIds, string? sortBy, string sortDirection,
        int page, int pageSize, CancellationToken ct = default)
    {
        var key = BuildKey(plan, groupIds, fileIds, allowedFileIds, sortBy, sortDirection, page, pageSize);
        var revision = await revisions.RevisionAsync(ct);
        var versionedKey = $"search:{revision}:{key}";
        if (store.TryGet(versionedKey, out var hit) && hit is not null) return hit;

        var gate = store.Gate(versionedKey);
        await gate.WaitAsync(ct);
        try
        {
            if (store.TryGet(versionedKey, out hit) && hit is not null) return hit;
            var result = await inner.ExecuteAsync(plan, groupIds, fileIds, allowedFileIds,
                sortBy, sortDirection, page, pageSize, ct);
            // A concurrent write can finish while the search is running.
            if (await revisions.RevisionAsync(ct) == revision)
                store.Set(versionedKey, result);
            return result;
        }
        finally
        {
            gate.Release();
        }
    }

    public Task<IReadOnlyList<SearchResultRow>> ExecuteTopAsync(
        SearchPlan plan, IReadOnlyList<Guid> groupIds, IReadOnlyList<Guid> fileIds,
        IReadOnlyList<Guid>? allowedFileIds, int take, CancellationToken ct = default)
        => inner.ExecuteTopAsync(plan, groupIds, fileIds, allowedFileIds, take, ct);

    private static string BuildKey(SearchPlan plan, IReadOnlyList<Guid> groupIds,
        IReadOnlyList<Guid> fileIds, IReadOnlyList<Guid>? allowedFileIds,
        string? sortBy, string sortDirection, int page, int pageSize)
    {
        static string[] Canonical(IReadOnlyList<Guid> ids) => ids.Distinct().OrderBy(id => id)
            .Select(id => id.ToString("N")).ToArray();
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            plan,
            groups = Canonical(groupIds),
            files = Canonical(fileIds),
            allowed = allowedFileIds is null ? null : Canonical(allowedFileIds),
            sortBy,
            sortDirection,
            page,
            pageSize,
        });
        return Convert.ToHexString(SHA256.HashData(payload));
    }
}
