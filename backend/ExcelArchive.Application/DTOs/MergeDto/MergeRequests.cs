namespace ExcelArchive.Application.DTOs.MergeDto;

public record MergeDeleteKeyRequest(Guid SessionId, string Table, int RowNumber);
public record MergeSheetRequest(Guid Token, string Sheet);
public sealed record MergeRunTable(Guid Token, string SheetName, Dictionary<string, int> Mapping);
/// <summary>Custom merge rule: mandatory link field + optional confirm field
/// (standard mapped field keys, e.g. nationalId confirmed by shamCash).</summary>
public sealed record CustomMergeRuleDto(string LinkField, string? ConfirmField);
public sealed record MergeRunRequest(MergeRunTable? Left, MergeRunTable? Right, bool? IgnoreConfirmation, List<string>? RuleOrder, List<CustomMergeRuleDto>? CustomRules);
public record MergeExportRequest(Guid SessionId, string? Scope = "confirmed");
