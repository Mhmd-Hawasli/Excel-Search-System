namespace ExcelArchive.Domain.Entities;

public class IgnoredConflict
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Rule { get; set; } = "";
    public Guid RecordId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Record Record { get; set; } = null!;
}
