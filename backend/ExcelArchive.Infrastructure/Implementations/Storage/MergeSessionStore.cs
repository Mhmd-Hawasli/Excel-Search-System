using ExcelArchive.Application.Interfaces.Storage;
using System.Collections.Concurrent;
using ExcelArchive.Domain.Merge;
using Microsoft.Extensions.Caching.Memory;

namespace ExcelArchive.Infrastructure.Implementations.Storage;

/// <summary>
/// In-memory two-file merge sessions (P5.1). Port of V1 lib/merge/session.ts:
/// isolated, no archive DB, 12h TTL, existing keys preserved on relink.
/// </summary>
public class MergeSessionStore(IMemoryCache cache) : IMergeSessionStore
{
    private static readonly ConcurrentDictionary<Guid, byte> Keys = new();
    private const int MaxEntries = 50;
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(12);

    public MergeSessionData Create(
        string leftSheet, List<string> leftHeaders, List<MergeRow> leftRows, MergeMapping leftMapping,
        string rightSheet, List<string> rightHeaders, List<MergeRow> rightRows, MergeMapping rightMapping,
        bool ignoreConfirmation)
    {
        if (Keys.Count >= MaxEntries)
        {
            var oldest = Keys.Keys.FirstOrDefault();
            if (oldest != Guid.Empty) Remove(oldest);
        }
        var s = new MergeSessionData
        {
            Id = Guid.NewGuid(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            IgnoreConfirmation = ignoreConfirmation,
            LeftSheetName = leftSheet,
            LeftHeaders = leftHeaders,
            LeftRows = leftRows,
            LeftMapping = leftMapping,
            RightSheetName = rightSheet,
            RightHeaders = rightHeaders,
            RightRows = rightRows,
            RightMapping = rightMapping,
        };
        cache.Set(Key(s.Id), s, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = Ttl,
            Size = 1,
            PostEvictionCallbacks =
            {
                new PostEvictionCallbackRegistration
                {
                    EvictionCallback = (k, v, r, st) =>
                    {
                        if (v is MergeSessionData d) Keys.TryRemove(d.Id, out _);
                    }
                }
            },
        });
        Keys.TryAdd(s.Id, 0);
        return s;
    }

    public MergeSessionData Get(Guid id)
    {
        if (cache.TryGetValue(Key(id), out MergeSessionData? s) && s is not null)
            return s;
        throw new KeyNotFoundException("انتهت جلسة الدمج أو لم تعد موجودة. يرجى إعادة رفع الملفين من جديد.");
    }

    public void Remove(Guid id)
    {
        cache.Remove(Key(id));
        Keys.TryRemove(id, out _);
    }

    /// <summary>
    /// Deletes the link key of one row (and its pair), then re-applies rules
    /// only to still-unlinked rows. Existing keys never touched (V1 parity).
    /// </summary>
    public MergeResult DeletePairKeyAndRelink(Guid sessionId, string table, int rowNumber)
    {
        var session = Get(sessionId);
        var side = table == "left" ? session.LeftRows
            : table == "right" ? session.RightRows : null;
        if (side is null)
            throw new InvalidDataException("بيانات غير صالحة.");
        var row = side.FirstOrDefault(r => r.RowNumber == rowNumber);
        if (row is null)
            throw new KeyNotFoundException("الصف غير موجود في الجدول.");
        if (row.Key is null)
            throw new KeyNotFoundException("الصف غير مربوط، لا يوجد مفتاح لحذفه.");
        var key = row.Key;
        foreach (var target in new[] { session.LeftRows, session.RightRows })
            foreach (var entry in target)
                if (entry.Key == key)
                {
                    entry.Key = null;
                    entry.Rule = null;
                    entry.Confirmed = false;
                }
        var startKey = MergeEngine.NextKeyAfter([..session.LeftRows, ..session.RightRows]);
        var result = MergeEngine.RelinkUnmatched(
            session.LeftRows, session.RightRows,
            session.LeftMapping, session.RightMapping,
            startKey, requireConfirmation: !session.IgnoreConfirmation);
        session.UpdatedAt = DateTime.UtcNow;
        return MergeEngine.Summarize(
            session.LeftRows, session.RightRows,
            session.LeftMapping, session.RightMapping);
    }

    private static string Key(Guid id) => $"mergesession:{id}";
}
