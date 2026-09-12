using ExcelArchive.Application.Interfaces.Storage;
using System.Collections.Concurrent;
using ExcelArchive.Domain.Merge;
using Microsoft.Extensions.Caching.Memory;

namespace ExcelArchive.Infrastructure.Implementations.Storage;

/// <summary>
/// Short-lived in-memory store for prepared two-file merge exports.
/// Mirrors SheetMergeStore export buffers: 15min TTL, oldest evicted past
/// the cap. Nothing touches the archive DB or disk.
/// </summary>
public class MergeExportStore(IMemoryCache cache) : IMergeExportStore
{
    private static readonly ConcurrentDictionary<string, byte> Keys = new();
    private const int MaxExports = 50;
    private static readonly TimeSpan ExportTtl = TimeSpan.FromMinutes(15);

    private static string Key(Guid id) => $"mergeexport:{id}";

    public MergeExportData SaveExport(byte[] buffer, string filename)
    {
        if (Keys.Count >= MaxExports)
        {
            var oldest = Keys.Keys.FirstOrDefault();
            if (oldest is not null)
            {
                cache.Remove(oldest);
                Keys.TryRemove(oldest, out _);
            }
        }
        var payload = new MergeExportData(Guid.NewGuid(), DateTime.UtcNow, buffer, filename);
        var key = Key(payload.Id);
        cache.Set(key, payload, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = ExportTtl,
            Size = Math.Max(1, buffer.Length / (1024 * 1024)),
            PostEvictionCallbacks =
            {
                new PostEvictionCallbackRegistration
                {
                    EvictionCallback = (k, v, r, s) =>
                        Keys.TryRemove(k?.ToString() ?? "", out _),
                }
            },
        });
        Keys.TryAdd(key, 0);
        return payload;
    }

    public MergeExportData GetExport(Guid downloadId)
    {
        if (cache.TryGetValue(Key(downloadId), out MergeExportData? e) && e is not null)
            return e;
        throw new KeyNotFoundException("انتهت صلاحية ملف التصدير المؤقت. يرجى تصدير الملف من جديد.");
    }
}
