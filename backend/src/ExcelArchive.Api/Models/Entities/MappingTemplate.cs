using System.Text.Json;

namespace ExcelArchive.Api.Models.Entities;

public class MappingTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public string Name { get; set; } = "";
    public string HeaderSignature { get; set; } = "";
    public JsonDocument Mapping { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Group Group { get; set; } = null!;
}
