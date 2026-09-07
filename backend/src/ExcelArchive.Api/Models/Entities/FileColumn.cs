using ExcelArchive.Api.Models.Enums;

namespace ExcelArchive.Api.Models.Entities;

public class FileColumn
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FileId { get; set; }
    public string HeaderRaw { get; set; } = "";
    public string HeaderNormalized { get; set; } = "";
    public int ColumnIndex { get; set; }
    public int SortOrder { get; set; }
    public Guid? CategoryId { get; set; }
    public StandardField? StandardField { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public File File { get; set; } = null!;
    public Category? Category { get; set; }
    public ICollection<RecordEdit> RecordEdits { get; set; } = new List<RecordEdit>();
}
