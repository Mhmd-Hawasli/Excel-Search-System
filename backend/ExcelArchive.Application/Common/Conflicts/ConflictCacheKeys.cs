using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ExcelArchive.Application.Common.Conflicts;

/// <summary>Deterministic conflict-cache key building (format + canonical request hash).</summary>
public static class ConflictCacheKeys
{
    public const string Format = "conflicts-v1";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>V1 conflictQueryCacheKey: sha256 over [format, domain, canonical].</summary>
    public static string BuildKey(string domain, string canonical)
    {
        var json = JsonSerializer.Serialize(new[] { Format, domain, canonical }, JsonOptions);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json))).ToLowerInvariant();
    }

    public static string CanonicalListKey(
        string category, string field, string rule,
        int page, int pageSize, string sortBy, string sortDir,
        IReadOnlyList<Guid>? scopeFileIds)
    {
        var scope = scopeFileIds is null
            ? "global"
            : string.Join(",", scopeFileIds.OrderBy(g => g).Select(g => g.ToString()));
        return JsonSerializer.Serialize(
            new { category, field, rule, page, pageSize, sortBy, sortDir, scope }, JsonOptions);
    }
}
