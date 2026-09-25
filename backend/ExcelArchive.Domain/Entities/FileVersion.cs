namespace ExcelArchive.Domain.Entities;

/// <summary>Version history entry for a file: every N → N+1 bump (manual bump
/// button or file update) records here WHAT changed and WHO did it, so the
/// version number is never bare. V1 of the file is backfilled by the seeder.
/// File deletion cascades its version rows.</summary>
public class FileVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FileId { get; set; }
    /// <summary>The version number this entry describes (1-based).</summary>
    public int Version { get; set; } = 1;
    /// <summary>Arabic note: what changed in this version (required).</summary>
    public string Note { get; set; } = "";
    /// <summary>How this version was created: manual | update | seed.</summary>
    public string Kind { get; set; } = "manual";
    public string? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// <summary>Compressed, exact workbook state at the end of this version.
    /// Legacy versions without a snapshot cannot be exported faithfully.</summary>
    public byte[]? SnapshotGzip { get; set; }

    public File File { get; set; } = null!;
}
