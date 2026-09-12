using ExcelArchive.Domain.Enums;

namespace ExcelArchive.Application.DTOs.ActivityDto;

public record ActivityLogDto(Guid Id, string Action, string TargetName, IReadOnlyDictionary<string, object?> Details, DateTime CreatedAt);
public record ActivityFilterRequest(int Page = 1, int PageSize = 50, string? Action = null, string? Search = null);
public record ActivityResult(IReadOnlyList<ActivityLogDto> Items, int Total, int Page, int PageSize);
