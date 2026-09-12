namespace ExcelArchive.Application.DTOs.UploadDto;

public record LinkedSheetsRequest(Guid Token, IReadOnlyList<string>? LinkedSheets, int NationalIdColumnIndex = 0);
