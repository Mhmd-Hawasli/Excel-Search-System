using ExcelArchive.Application.Interfaces.Storage;
using System.Collections.Concurrent;
using Microsoft.Extensions.Caching.Memory;

namespace ExcelArchive.Infrastructure.Implementations.Storage;

/// <summary>
/// Isolated file storage for the two-file merge section (P5.1).
/// Port of V1 lib/merge/storage.ts tmp/merge + 12h TTL.
/// Separate namespace from archive uploads and sheet-merge; nothing here
/// touches the archive database. Tokens are UUIDs.
/// </summary>
public sealed record MergeFileEntry(
    Guid Token, string FileName, byte[] Content, DateTime CreatedAt);

public class MergeFileStore(IMemoryCache cache) : IMergeFileStore
{
    private static readonly ConcurrentDictionary<Guid, byte> Keys = new();
    private const int MaxEntries = 50;
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(12);

    Guid IMergeFileStore.Save(string fileName, byte[] content) => Save(fileName, content).Token;

    public byte[] Load(Guid token) => Get(token).Content;

    public MergeFileEntry Save(string fileName, byte[] content)
    {
        Prune();
        if (Keys.Count >= MaxEntries)
        {
            var oldest = Keys.Keys.FirstOrDefault();
            if (oldest != Guid.Empty) Remove(oldest);
        }
        var entry = new MergeFileEntry(Guid.NewGuid(), fileName, content, DateTime.UtcNow);
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
                        if (v is MergeFileEntry e) Keys.TryRemove(e.Token, out _);
                    }
                }
            },
        });
        Keys.TryAdd(entry.Token, 0);
        return entry;
    }

    public MergeFileEntry Get(Guid token)
    {
        Prune();
        if (cache.TryGetValue(Key(token), out MergeFileEntry? e) && e is not null)
            return e;
        throw new KeyNotFoundException("تعذر قراءة المصنف. يرجى إعادة رفع الملف.");
    }

    public void Remove(Guid token)
    {
        cache.Remove(Key(token));
        Keys.TryRemove(token, out _);
    }

    private void Prune()
    {
        // IMemoryCache expires lazily; Keys set is pruned on eviction callback.
        // Opportunistic: nothing to scan without enumerating cache.
    }

    private static string Key(Guid token) => $"mergefile:{token}";
}
