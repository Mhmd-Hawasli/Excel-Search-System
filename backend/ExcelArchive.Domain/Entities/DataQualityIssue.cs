using ExcelArchive.Domain.Enums;

namespace ExcelArchive.Domain.Entities;

public class DataQualityIssue
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FileId { get; set; }
    public int RowIndex { get; set; }
    public DataQualityIssueType IssueType { get; set; }
    public string? ColumnName { get; set; }
    public string? RawValue { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public File File { get; set; } = null!;
}
