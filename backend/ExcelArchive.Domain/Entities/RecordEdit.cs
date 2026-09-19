namespace ExcelArchive.Domain.Entities;

public class RecordEdit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// <summary>Owning record. Null for edits archived from a previous file
    /// version: the old rows are replaced on update, but the edit log itself
    /// is preserved and stays visible in the edit history (never on the
    /// record page, which only shows current-version edits).</summary>
    public Guid? RecordId { get; set; }
    public Guid FileId { get; set; }
    public Guid? FileColumnId { get; set; }
    /// <summary>File version this edit was made on. Archived edits keep the
    /// old version number so history can label them (V1, V2, ...).</summary>
    public int FileVersion { get; set; } = 1;
    public string HeaderRaw { get; set; } = "";
    public string OldValue { get; set; } = "";
    public string NewValue { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Username of whoever made this edit (V2 addition; null for
    /// legacy rows recorded before the field existed).</summary>
    public string? EditedBy { get; set; }

    public Record? Record { get; set; }
    public File File { get; set; } = null!;
    public FileColumn? FileColumn { get; set; }
}
