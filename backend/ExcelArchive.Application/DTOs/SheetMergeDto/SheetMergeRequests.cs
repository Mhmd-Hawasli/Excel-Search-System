namespace ExcelArchive.Application.DTOs.SheetMergeDto;

public record SheetMergeRunRequest(Guid UploadId, int NationalIdColumn, List<string> SheetNames);
public record SheetMergeExportRequest(Guid SessionId);
