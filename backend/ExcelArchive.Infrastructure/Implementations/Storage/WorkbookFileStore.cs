using System.Text.RegularExpressions;
using ExcelArchive.Application.Interfaces.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ExcelArchive.Infrastructure.Implementations.Storage;

/// <summary>
/// Durable private file store for uploaded workbooks + format sidecars,
/// mirroring V1 tmp/uploads/{token}.xlsx + {token}.styles.json. Files survive
/// restarts (unlike the old in-memory session store); stale UUID files are
/// pruned. Tokens are validated UUIDs so paths cannot escape the root.
/// </summary>
public sealed class WorkbookFileStore : IWorkbookFileStore
{
    private static readonly Regex TokenPattern = new(
        "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private readonly string _root;
    private readonly ILogger<WorkbookFileStore>? _logger;

    public WorkbookFileStore(IConfiguration configuration, ILogger<WorkbookFileStore>? logger = null)
    {
        _root = configuration["UploadStore:Path"]
            ?? Path.Combine(Path.GetTempPath(), "excel-archive-uploads");
        _logger = logger;
        Directory.CreateDirectory(_root);
    }

    public string Root => _root;

    public static bool IsValidToken(string? token) => token is not null && TokenPattern.IsMatch(token);

    public string PathFor(string token)
    {
        if (!IsValidToken(token)) throw new InvalidDataException("رمز الملف غير صالح.");
        return Path.Combine(_root, token + ".xlsx");
    }

    public string SidecarPathFor(string token)
    {
        if (!IsValidToken(token)) throw new InvalidDataException("رمز الملف غير صالح.");
        return Path.Combine(_root, token + ".styles.json");
    }

    public async Task<string> SaveAsync(string fileName, byte[] bytes, CancellationToken ct = default)
    {
        var token = Guid.NewGuid().ToString();
        await File.WriteAllBytesAsync(PathFor(token), bytes, ct);
        PruneStale();
        return token;
    }

    public async Task<byte[]> LoadAsync(string token, CancellationToken ct = default)
    {
        var path = PathFor(token);
        if (!File.Exists(path)) throw new KeyNotFoundException("انتهت صلاحية ملف الرفع. أعد رفع المصنف.");
        return await File.ReadAllBytesAsync(path, ct);
    }

    public void Remove(string token)
    {
        TryDelete(PathFor(token));
        TryDelete(SidecarPathFor(token));
    }

    public async Task WriteSidecarAsync(string token, FormatSidecar sidecar, CancellationToken ct = default)
    {
        try { await File.WriteAllTextAsync(SidecarPathFor(token), FormatSidecarStore.Serialize(sidecar), ct); }
        catch (Exception ex) { _logger?.LogWarning(ex, "Could not write format sidecar"); }
    }

    public async Task<FormatSidecar?> ReadSidecarAsync(string token, CancellationToken ct = default)
    {
        try
        {
            var path = SidecarPathFor(token);
            if (!File.Exists(path)) return null;
            return FormatSidecarStore.Deserialize(await File.ReadAllTextAsync(path, ct));
        }
        catch { return null; }
    }

    /// <summary>Best-effort removal of UUID-named files older than a day.</summary>
    public void PruneStale(TimeSpan? maxAge = null)
    {
        try
        {
            var cutoff = DateTime.UtcNow - (maxAge ?? TimeSpan.FromDays(1));
            foreach (var file in Directory.EnumerateFiles(_root, "*.xlsx"))
            {
                var name = Path.GetFileNameWithoutExtension(file);
                if (!IsValidToken(name)) continue;
                try
                {
                    if (File.GetLastWriteTimeUtc(file) < cutoff)
                    {
                        TryDelete(file);
                        TryDelete(Path.Combine(_root, name + ".styles.json"));
                    }
                }
                catch { /* locked or already removed */ }
            }
        }
        catch (Exception ex) { _logger?.LogWarning(ex, "Upload prune failed"); }
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); } catch { /* ignore */ }
    }
}
