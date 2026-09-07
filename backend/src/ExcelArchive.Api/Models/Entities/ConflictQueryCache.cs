using System.Text.Json;

namespace ExcelArchive.Api.Models.Entities;

public class ConflictQueryCache
{
    public string Key { get; set; } = "";
    public long SourceRevision { get; set; }
    public DateOnly CheckedDate { get; set; }
    public JsonDocument Payload { get; set; } = null!;
    public DateTime RebuiltAt { get; set; } = DateTime.UtcNow;
}
