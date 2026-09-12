namespace ExcelArchive.Domain.Entities;

public class File
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string OriginalFilename { get; set; } = "";
    public string SheetName { get; set; } = "";
    public int RowCount { get; set; }
    public string ColumnSignature { get; set; } = "";
    public int Version { get; set; } = 1;
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Group Group { get; set; } = null!;
    public ICollection<FileColumn> Columns { get; set; } = new List<FileColumn>();
    public ICollection<Record> Records { get; set; } = new List<Record>();
    public ICollection<UploadJob> UploadJobs { get; set; } = new List<UploadJob>();
    public ICollection<DataQualityIssue> DataQualityIssues { get; set; } = new List<DataQualityIssue>();
    public ICollection<RecordEdit> RecordEdits { get; set; } = new List<RecordEdit>();
    public ICollection<UserPermission> ScopedPermissions { get; set; } = new List<UserPermission>();
}
