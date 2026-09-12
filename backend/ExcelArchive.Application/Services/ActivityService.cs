using System.Text.Json;
using ExcelArchive.Application.DTOs.ActivityDto;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Application.Interfaces.Services;

namespace ExcelArchive.Application.Services;

public class ActivityService(IUnitOfWork uow) : IActivityService
{
    public async Task<ActivityResult> ListAsync(ActivityFilterRequest request, CancellationToken ct = default)
    {
        var page = Math.Max(1, request.Page);
        // V1 logs page reads the latest 500 rows; unknown actions fall back
        // to no filter (V1 ACTION_KEYS check), never to an empty result.
        var pageSize = Math.Clamp(request.PageSize, 1, 500);
        // Enum comparison translates to SQL; Action.ToString() does not (runtime 500).
        // Both PascalCase ("FileUploaded") and snake_case ("file_uploaded") are accepted.
        ActivityAction? action = null;
        if (!string.IsNullOrWhiteSpace(request.Action) && TryParseAction(request.Action, out var parsed))
            action = parsed;
        ActivityAction? searched = null;
        if (!string.IsNullOrWhiteSpace(request.Search) && TryParseAction(request.Search.Trim(), out var parsedTerm))
            searched = parsedTerm;
        var (rows, total) = await uow.ActivityLogs.SearchAsync(action, request.Search, searched, page, pageSize, ct);

        return new ActivityResult(rows.Select(x =>
            new ActivityLogDto(x.Id, x.Action.ToString(), x.TargetName, ToDictionary(x.Details.RootElement), x.CreatedAt)).ToList(),
            total, page, pageSize);
    }

    public async Task WriteAsync(ActivityAction action, string targetName, object? details = null, CancellationToken ct = default)
    {
        var doc = details is null
            ? JsonDocument.Parse("{}")
            : JsonSerializer.SerializeToDocument(details);
        uow.ActivityLogs.Add(new ActivityLog
        {
            Action = action,
            TargetName = targetName,
            Details = doc,
            CreatedAt = DateTime.UtcNow,
        });
        await uow.SaveChangesAsync(ct);
    }

    private static IReadOnlyDictionary<string, object?> ToDictionary(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object) return new Dictionary<string, object?>();
        var result = new Dictionary<string, object?>();
        foreach (var prop in element.EnumerateObject())
        {
            result[prop.Name] = prop.Value.ValueKind == JsonValueKind.String
                ? prop.Value.GetString()
                : prop.Value.ValueKind == JsonValueKind.Number
                    ? prop.Value.GetInt64()
                    : prop.Value.GetRawText();
        }
        return result;
    }

    /// <summary>Accepts PascalCase ("FileUploaded") and snake_case ("file_uploaded").</summary>
    private static bool TryParseAction(string? value, out ActivityAction action)
    {
        action = default;
        var text = (value ?? "").Trim();
        if (text.Length == 0) return false;
        if (text.Contains('_'))
            text = string.Concat(text.Split('_', StringSplitOptions.RemoveEmptyEntries)
                .Select(p => char.ToUpperInvariant(p[0]) + p[1..].ToLowerInvariant()));
        return Enum.TryParse(text, ignoreCase: true, out action)
            && Enum.IsDefined(typeof(ActivityAction), action);
    }
}
