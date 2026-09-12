using System.Text.Json;
using ExcelArchive.Domain.Enums;

namespace ExcelArchive.Domain.Entities;

public class UploadJob
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? FileId { get; set; }
    public UploadJobStatus Status { get; set; } = UploadJobStatus.Pending;
    public int TotalRows { get; set; }
    public int ProcessedRows { get; set; }
    public string? ErrorMessage { get; set; }
    public JsonDocument Payload { get; set; } = null!;
    public DateTime? StartedAt { get; set; }
    public DateTime? FinishedAt { get; set; }

    public File? File { get; set; }
}
