using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

using ExcelArchive.Application.Interfaces.Caching;

namespace ExcelArchive.Infrastructure.Implementations.Caching;

/// <summary>
/// Persistent, revision-checked conflict query cache (P4.4).
/// Port of V1 src/lib/conflicts/cache.ts onto the EF cache tables
/// (ConflictCacheState id=1 + ConflictQueryCache), which the
/// Api/Data/ConflictCache.sql triggers keep revisioned on PostgreSQL.
/// Protocol: single-statement read (revision join + checked date); on miss
/// a per-key lock coalesces simultaneous builders, the pre-query
/// revision/date is kept, and the insert is skipped when a mutation
/// committed mid-computation. Oversized payloads are computed but never
/// persisted. Stale data is never served as a fallback.
/// </summary>
public class ConflictCacheService(AppDbContext db) : IConflictCacheService
{
    public const int MaxEntries = 128;
    public const int MaxPayloadBytes = 2 * 1024 * 1024;

    private static readonly ConcurrentDictionary<string, SemaphoreSlim> Locks = new();

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<T?> GetAsync<T>(string key, DateOnly today, CancellationToken ct = default)
    {
        var hit = await db.ConflictQueryCaches.AsNoTracking()
            .Where(c => c.Key == key && c.CheckedDate == today)
            .Join(db.ConflictCacheStates.AsNoTracking(),
                c => c.SourceRevision, s => s.Revision,
                (c, s) => c.Payload)
            .FirstOrDefaultAsync(ct);
        if (hit is null) return default;
        return hit.Deserialize<T>(JsonOptions);
    }

    public async Task EnsureStateAsync(CancellationToken ct = default)
    {
        if (!await db.ConflictCacheStates.AnyAsync(s => s.Id == 1, ct))
        {
            db.ConflictCacheStates.Add(new ConflictCacheState { Id = 1, Revision = 0 });
            await db.SaveChangesAsync(ct);
        }
    }

    public async Task<long> RevisionAsync(CancellationToken ct = default)
    {
        await EnsureStateAsync(ct);
        return await db.ConflictCacheStates.AsNoTracking()
            .Where(s => s.Id == 1).Select(s => s.Revision).FirstAsync(ct);
    }

    /// <summary>
    /// Read-through with miss coalescing. The revision/date snapshot is
    /// taken before computing; the insert happens only when the snapshot
    /// still holds afterwards (no stale publish after mid-build writes).
    /// </summary>
    public async Task<T> GetOrComputeAsync<T>(
        string key, DateOnly today, Func<Task<T>> compute, CancellationToken ct = default)
        where T : class
    {
        var hit = await GetAsync<T>(key, today, ct);
        if (hit is not null) return hit;

        var gate = Locks.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            hit = await GetAsync<T>(key, today, ct);
            if (hit is not null) return hit;

            if (db.Database.IsNpgsql())
            {
                // User-initiated transactions must run inside the execution
                // strategy while the Npgsql retry policy is enabled.
                var strategy = db.Database.CreateExecutionStrategy();
                return await strategy.ExecuteAsync(async () =>
                {
                    await using var tx = await db.Database.BeginTransactionAsync(ct);
                    try
                    {
                        await db.Database.ExecuteSqlRawAsync(
                            "SELECT pg_advisory_xact_lock(hashtextextended({0}, 0))", [key], ct);
                        hit = await GetAsync<T>(key, today, ct);
                        if (hit is not null) { await tx.CommitAsync(ct); return hit; }
                        var revision = await RevisionAsync(ct);
                        var computed = await compute();
                        await StoreIfFreshAsync(key, revision, today, computed, ct);
                        await tx.CommitAsync(ct);
                        return computed;
                    }
                    catch
                    {
                        await tx.RollbackAsync(ct);
                        throw;
                    }
                });
            }

            await EnsureStateAsync(ct);
            var rev = await RevisionAsync(ct);
            var result = await compute();
            await StoreIfFreshAsync(key, rev, today, result, ct);
            return result;
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task StoreIfFreshAsync<T>(string key, long revision, DateOnly today, T value, CancellationToken ct)
    {
        var payload = JsonSerializer.Serialize(value, JsonOptions);
        if (Encoding.UTF8.GetByteCount(payload) > MaxPayloadBytes) return;
        var current = await db.ConflictCacheStates.AsNoTracking()
            .Where(s => s.Id == 1)
            .Select(s => new { s.Revision })
            .FirstOrDefaultAsync(ct);
        if (current is null || current.Revision != revision) return;
        var todayNow = DateOnly.FromDateTime(DateTime.UtcNow);
        if (todayNow != today) return;
        var doc = JsonDocument.Parse(payload);
        var existing = await db.ConflictQueryCaches.FirstOrDefaultAsync(c => c.Key == key, ct);
        if (existing is null)
            db.ConflictQueryCaches.Add(new ConflictQueryCache
            {
                Key = key, SourceRevision = revision, CheckedDate = today,
                Payload = doc, RebuiltAt = DateTime.UtcNow,
            });
        else
        {
            existing.SourceRevision = revision;
            existing.CheckedDate = today;
            existing.Payload = doc;
            existing.RebuiltAt = DateTime.UtcNow;
        }
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return;
        }
        await PruneAsync(today, ct);
    }

    public async Task PruneAsync(DateOnly today, CancellationToken ct = default)
    {
        var staleKeys = await db.ConflictQueryCaches
            .Where(c => c.CheckedDate != today)
            .Select(c => c.Key)
            .ToListAsync(ct);
        var overflowKeys = await db.ConflictQueryCaches
            .OrderByDescending(c => c.RebuiltAt).ThenBy(c => c.Key)
            .Skip(MaxEntries)
            .Select(c => c.Key)
            .ToListAsync(ct);
        var doomed = staleKeys.Concat(overflowKeys).Distinct(StringComparer.Ordinal).ToList();
        if (doomed.Count == 0) return;
        var rows = await db.ConflictQueryCaches.Where(c => doomed.Contains(c.Key)).ToListAsync(ct);
        db.ConflictQueryCaches.RemoveRange(rows);
        await db.SaveChangesAsync(ct);
    }
}
