namespace ExcelArchive.Api.DTOs.Backup;

public record BackupSummary(IReadOnlyDictionary<string, int> Counts, DateTime GeneratedAt);
