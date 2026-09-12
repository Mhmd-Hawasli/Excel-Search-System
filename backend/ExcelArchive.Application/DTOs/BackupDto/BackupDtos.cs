namespace ExcelArchive.Application.DTOs.BackupDto;

public record BackupSummary(IReadOnlyDictionary<string, int> Counts, DateTime GeneratedAt);
