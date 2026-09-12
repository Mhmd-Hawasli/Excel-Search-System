namespace ExcelArchive.Domain.Entities;

public class UserPermission
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Permission { get; set; } = "";
    public Guid? GroupId { get; set; }
    public Guid? FileId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
    public Group? Group { get; set; }
    public File? File { get; set; }
}
