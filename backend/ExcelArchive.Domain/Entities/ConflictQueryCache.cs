using System.Text.Json;

namespace ExcelArchive.Domain.Entities;

/// <summary>
/// Persistent conflict query cache entry. Text hash key, source revision + checked
/// date agreement, JSONB payload, rebuild timestamp. No Guid BaseEntity.
/// V1: prisma ConflictQueryCache (key text PK, sourceRevision BigInt, checkedDate Date,
/// payload JsonB, rebuiltAt Timestamptz(3)).
/// Caps (128 entries / 2MiB per entry) enforced by query service, not the schema.
/// </summary>
public class ConflictQueryCache
{
    public string Key { get; set; } = "";
    public long SourceRevision { get; set; }
    public DateOnly CheckedDate { get; set; }
    public JsonDocument Payload { get; set; } = null!;
    public DateTime RebuiltAt { get; set; } = DateTime.UtcNow;
}
