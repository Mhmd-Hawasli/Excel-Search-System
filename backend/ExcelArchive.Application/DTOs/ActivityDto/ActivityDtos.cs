using ExcelArchive.Domain.Enums;

namespace ExcelArchive.Application.DTOs.ActivityDto;

public record ActivityLogDto(Guid Id, string Action, string TargetName, string? Actor, IReadOnlyDictionary<string, object?> Details, DateTime CreatedAt,
    // Enriched at read time (additive, nullable): historical file name from
    // details when present, otherwise the current file name resolved via
    // fileId; null when the file was deleted or the event has no file.
    // Old rows without these keys keep working (null fallback in the UI).
    string? FileName = null, int? FileVersion = null);
public record ActivityFilterRequest(int Page = 1, int PageSize = 50, string? Action = null, string? Search = null,
    // Private-group visibility gate (additive, optional): when set and the
    // caller may not see foreign private groups, rows leaking them are
    // dropped. Null keeps the legacy unfiltered behavior for internal callers.
    ActivityVisibility? Visibility = null);
/// <summary>Who is reading the activity log: private groups owned by
/// <see cref="UserId"/> stay visible, all other private groups are hidden
/// unless <see cref="CanViewPrivate"/> (groups.viewPrivate) is set.</summary>
public record ActivityVisibility(Guid UserId, bool CanViewPrivate);
public record ActivityResult(IReadOnlyList<ActivityLogDto> Items, int Total, int Page, int PageSize);
