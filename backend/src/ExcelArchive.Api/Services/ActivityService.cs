using System.Text.Json;
using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Activity;
using ExcelArchive.Api.Models.Enums;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Services;

public class ActivityService(AppDbContext db) : IActivityService
{
    public async Task<ActivityResult> ListAsync(ActivityFilterRequest request, CancellationToken ct = default)
    {
        var query = db.ActivityLogs.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(request.Action))
        {
            query = query.Where(x => x.Action.ToString() == request.Action);
        }
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim();
            query = query.Where(x => x.TargetName.Contains(term) || x.Action.ToString().Contains(term));
        }

        var total = await query.CountAsync(ct);
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);
        var rows = await query.OrderByDescending(x => x.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new ActivityResult(rows.Select(x =>
            new ActivityLogDto(x.Id, x.Action.ToString(), x.TargetName, ToDictionary(x.Details.RootElement), x.CreatedAt)).ToList(),
            total, page, pageSize);
    }

    public async Task WriteAsync(ActivityAction action, string targetName, object? details = null, CancellationToken ct = default)
    {
        var doc = details is null
            ? JsonDocument.Parse("{}")
            : JsonSerializer.SerializeToDocument(details);
        db.ActivityLogs.Add(new ActivityLog
        {
            Action = action,
            TargetName = targetName,
            Details = doc,
            CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync(ct);
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
}
