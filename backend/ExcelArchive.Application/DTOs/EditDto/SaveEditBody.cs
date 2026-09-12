namespace ExcelArchive.Application.DTOs.EditDto;

public record SaveEditBody(Guid? FileColumnId, string? HeaderRaw, string? NewValue, bool Revert = false);
