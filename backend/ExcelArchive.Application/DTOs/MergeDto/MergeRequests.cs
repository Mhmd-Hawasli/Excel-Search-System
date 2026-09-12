namespace ExcelArchive.Application.DTOs.MergeDto;

public record MergeDeleteKeyRequest(Guid SessionId, string Table, int RowNumber);
public record MergeSheetRequest(Guid Token, string Sheet);
public sealed record MergeRunTable(Guid Token, string SheetName, Dictionary<string, int> Mapping);
public sealed record MergeRunRequest(MergeRunTable? Left, MergeRunTable? Right, bool? IgnoreConfirmation);
public record MergeExportRequest(Guid SessionId, string? Scope = "confirmed");
