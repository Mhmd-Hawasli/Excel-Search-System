namespace ExcelArchive.Domain.Entities;

public class Group
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public int SortOrder { get; set; }
    /// <summary>When true (default), the group is preselected in the general
    /// search scope. Excluding heavy groups speeds up the default search.</summary>
    public bool IncludeInDefaultSearch { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<File> Files { get; set; } = new List<File>();
    public ICollection<MappingTemplate> Templates { get; set; } = new List<MappingTemplate>();
    public ICollection<UserPermission> ScopedPermissions { get; set; } = new List<UserPermission>();
}
