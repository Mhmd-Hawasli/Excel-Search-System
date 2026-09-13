namespace ExcelArchive.Domain.Entities;

public class RecordEdit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RecordId { get; set; }
    public Guid FileId { get; set; }
    public Guid? FileColumnId { get; set; }
    public string HeaderRaw { get; set; } = "";
    public string OldValue { get; set; } = "";
    public string NewValue { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Username of whoever made this edit (V2 addition; null for
    /// legacy rows recorded before the field existed).</summary>
    public string? EditedBy { get; set; }

    public Record Record { get; set; } = null!;
    public File File { get; set; } = null!;
    public FileColumn? FileColumn { get; set; }
}
