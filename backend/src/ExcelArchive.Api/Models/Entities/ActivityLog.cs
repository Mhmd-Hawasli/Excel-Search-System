using System.Text.Json;
using ExcelArchive.Api.Models.Enums;

namespace ExcelArchive.Api.Models.Entities;

public class ActivityLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public ActivityAction Action { get; set; }
    public string TargetName { get; set; } = "";
    public JsonDocument Details { get; set; } = JsonDocument.Parse("{}");
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
