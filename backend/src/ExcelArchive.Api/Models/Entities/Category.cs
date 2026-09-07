namespace ExcelArchive.Api.Models.Entities;

public class Category
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<FileColumn> Columns { get; set; } = new List<FileColumn>();
}
