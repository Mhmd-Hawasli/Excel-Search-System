using ExcelArchive.Application.Interfaces.Storage;
using Microsoft.Extensions.Caching.Memory;
using System.Collections.Concurrent;

namespace ExcelArchive.Infrastructure.Implementations.Storage;

/// <summary>
/// Isolated temp storage for bulk-search uploads (البحث الجماعي).
/// Port of the merge file-store pattern: UUID tokens, max 50 entries,
/// 12h TTL, foreground pruning via eviction callbacks.
/// </summary>
public sealed record BulkSearchFileEntry(
    Guid Token, string FileName, byte[] Content, DateTime CreatedAt);

public class BulkSearchFileStore(IMemoryCache cache) : IBulkSearchFileStore
{
    private static readonly ConcurrentDictionary<Guid, byte> Keys = new();
    private const int MaxEntries = 50;
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(12);

    public Guid Save(string fileName, byte[] content)
    {
        if (Keys.Count >= MaxEntries)
        {
            var oldest = Keys.Keys.FirstOrDefault();
            if (oldest != Guid.Empty) Remove(oldest);
        }
        var entry = new BulkSearchFileEntry(Guid.NewGuid(), fileName, content, DateTime.UtcNow);
        cache.Set(Key(entry.Token), entry, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = Ttl,
            Size = 1,
            PostEvictionCallbacks =
            {
                new PostEvictionCallbackRegistration
                {
                    EvictionCallback = (k, v, r, s) =>
                    {
                        if (v is BulkSearchFileEntry e) Keys.TryRemove(e.Token, out _);
                    }
                }
            },
        });
        Keys.TryAdd(entry.Token, 0);
        return entry.Token;
    }

    public byte[] Load(Guid token)
    {
        if (cache.TryGetValue(Key(token), out BulkSearchFileEntry? e) && e is not null)
            return e.Content;
        throw new KeyNotFoundException("تعذر قراءة المصنف. يرجى إعادة رفع الملف.");
    }

    public void Remove(Guid token)
    {
        cache.Remove(Key(token));
        Keys.TryRemove(token, out _);
    }

    private static string Key(Guid token) => $"bulksearchfile:{token}";
}
