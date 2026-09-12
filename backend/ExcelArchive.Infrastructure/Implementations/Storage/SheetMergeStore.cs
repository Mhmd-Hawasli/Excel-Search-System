using ExcelArchive.Application.Interfaces.Storage;
using System.Collections.Concurrent;
using ExcelArchive.Domain.SheetMerge;
using Microsoft.Extensions.Caching.Memory;

namespace ExcelArchive.Infrastructure.Implementations.Storage;

/// <summary>
/// Temporary in-memory storage for sheet-merge (P5.3). Port of V1
/// lib/sheet-merge/store.ts: uploads + sessions live 12h, prepared export
/// buffers 15min. Nothing touches the archive DB or disk; ids never cross
/// with the two-file merge stores.
/// </summary>
public class SheetMergeStore(IMemoryCache cache) : ISheetMergeStore
{
    private static readonly ConcurrentDictionary<string, byte> Keys = new();
    private const int MaxUploads = 20;
    private const int MaxSessions = 50;
    private const int MaxExports = 50;
    private static readonly TimeSpan UploadTtl = TimeSpan.FromHours(12);
    private static readonly TimeSpan ExportTtl = TimeSpan.FromMinutes(15);

    private static string Key(string ns, Guid id) => $"sheetmerge:{ns}:{id}";

    private void EvictOldest(string ns, int max)
    {
        var mine = Keys.Keys.Where(k => k.StartsWith(ns, StringComparison.Ordinal)).ToList();
        if (mine.Count < max) return;
        var oldest = mine.First();
        cache.Remove(oldest);
        Keys.TryRemove(oldest, out _);
    }

    private void Set(string key, object value, TimeSpan ttl, int size)
    {
        cache.Set(key, value, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = ttl,
            Size = size,
            PostEvictionCallbacks =
            {
                new PostEvictionCallbackRegistration
                {
                    EvictionCallback = (k, v, r, s) =>
                        Keys.TryRemove(k?.ToString() ?? "", out _),
                },
            },
        });
        Keys.TryAdd(key, 0);
    }

    public UploadedWorkbook SaveUpload(UploadedWorkbook uploaded)
    {
        EvictOldest("sheetmerge:up:", MaxUploads);
        Set(Key("up", uploaded.Id), uploaded, UploadTtl, 1);
        return uploaded;
    }

    public UploadedWorkbook GetUpload(Guid uploadId)
    {
        if (cache.TryGetValue(Key("up", uploadId), out UploadedWorkbook? w) && w is not null)
            return w;
        throw new KeyNotFoundException("انتهت الجلسة المؤقتة للملف أو لم تعد موجودة. يرجى رفع الملف من جديد.");
    }

    public SheetMergeSessionData SaveSession(
        Guid uploadId, int nationalIdColumn, IReadOnlyList<string> sheetNames, SheetMergeStats result)
    {
        EvictOldest("sheetmerge:se:", MaxSessions);
        var session = new SheetMergeSessionData(Guid.NewGuid(), DateTime.UtcNow,
            uploadId, nationalIdColumn, sheetNames.ToList(), result);
        Set(Key("se", session.Id), session, UploadTtl, 1);
        return session;
    }

    public SheetMergeSessionData GetSession(Guid sessionId)
    {
        if (cache.TryGetValue(Key("se", sessionId), out SheetMergeSessionData? s) && s is not null)
            return s;
        throw new KeyNotFoundException("انتهت جلسة الدمج أو لم تعد موجودة. يرجى إعادة الدمج من جديد.");
    }

    public SheetMergeExportData SaveExport(byte[] buffer, string filename, int sheetCount)
    {
        EvictOldest("sheetmerge:ex:", MaxExports);
        var payload = new SheetMergeExportData(Guid.NewGuid(), DateTime.UtcNow,
            buffer, filename, sheetCount);
        Set(Key("ex", payload.Id), payload, ExportTtl, Math.Max(1, buffer.Length / (1024 * 1024)));
        return payload;
    }

    public SheetMergeExportData GetExport(Guid downloadId)
    {
        if (cache.TryGetValue(Key("ex", downloadId), out SheetMergeExportData? e) && e is not null)
            return e;
        throw new KeyNotFoundException("انتهت صلاحية ملف التصدير المؤقت. يرجى تصدير الملف من جديد.");
    }
}
