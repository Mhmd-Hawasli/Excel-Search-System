using System.Text.Json;
using ExcelArchive.Application.DTOs.ActivityDto;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Application.Interfaces.Services;

namespace ExcelArchive.Application.Services;

public class ActivityService(IUnitOfWork uow) : IActivityService
{
    public async Task<ActivityResult> ListAsync(ActivityFilterRequest request, CancellationToken ct = default)
    {
        var page = Math.Clamp(request.Page, 1, 1_000_000);
        // Logs page loads the full history (client paginates 100/page):
        // rows are small, so a 1000-row window keeps full loads to a few
        // requests. Unknown actions fall back to no filter, never empty.
        var pageSize = Math.Clamp(request.PageSize, 1, 1000);
        // Enum comparison translates to SQL; Action.ToString() does not (runtime 500).
        // Both PascalCase ("FileUploaded") and snake_case ("file_uploaded") are accepted.
        ActivityAction? action = null;
        if (!string.IsNullOrWhiteSpace(request.Action) && TryParseAction(request.Action, out var parsed))
            action = parsed;
        ActivityAction? searched = null;
        if (!string.IsNullOrWhiteSpace(request.Search) && TryParseAction(request.Search.Trim(), out var parsedTerm))
            searched = parsedTerm;
        // Private-group gate: rows leaking foreign private groups (their
        // files, names, or "header — file" targets) are dropped unless the
        // reader owns them or holds groups.viewPrivate. Internal callers
        // pass no visibility and keep the legacy unfiltered behavior.
        // Old rows need no migration: the check reads live group/file ids.
        ActivityPrivateExclusion? exclusion = null;
        if (request.Visibility is not null && !request.Visibility.CanViewPrivate)
            exclusion = await BuildPrivateExclusionAsync(request.Visibility.UserId, ct);
        var (visible, total) = await uow.ActivityLogs.SearchAsync(
            action, request.Search, searched, page, pageSize, exclusion, ct);

        // Enrich file context for old rows: RECORD_EDITED history never
        // stored fileName/fileVersion (only fileId), while RECORD_VISITED /
        // RECORD_DELETED did store fileName. Resolve current names/versions
        // via fileId so the UI can show "person — file X (vN)" for every
        // row; deleted files fall back to the stored name or null.
        // Purely additive: no migration, old details untouched.
        var fileIds = visible
            .Select(r => FileIdFrom(r.Details))
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToList();
        Dictionary<Guid, (string Name, int Version)> filesById = new();
        if (fileIds.Count > 0)
        {
            var files = await uow.Files.ListWithGroupByIdsAsync(fileIds, ct);
            filesById = files.ToDictionary(f => f.Id, f => (f.Name, f.Version));
        }

        return new ActivityResult(visible.Select(x =>
        {
            var details = ToDictionary(x.Details.RootElement);
            var storedName = details.TryGetValue("fileName", out var fn) && fn is string s && !string.IsNullOrWhiteSpace(s) ? s : null;
            var storedVersion = StoredVersion(details);
            var fid = FileIdFrom(x.Details);
            var fileName = storedName ?? (fid.HasValue && filesById.TryGetValue(fid.Value, out var c1) ? c1.Name : null);
            int? fileVersion = storedVersion ?? (fid.HasValue && filesById.TryGetValue(fid.Value, out var c2) ? c2.Version : null);
            // File-level events carry no fileId in details but their target
            // IS the file name; surface its current version when known.
            if (fileName is null && fid is null && IsFileAction(x.Action))
                fileName = x.TargetName;
            if (fileVersion is null && fileName is not null && IsFileAction(x.Action))
            {
                foreach (var entry in filesById.Values)
                {
                    if (entry.Name == fileName) { fileVersion = entry.Version; break; }
                }
            }
            return new ActivityLogDto(x.Id, x.Action.ToString(), x.TargetName,
                ResolveActor(details), details, x.CreatedAt, fileName, fileVersion);
        }).ToList(),
            total, page, pageSize);
    }

    private async Task<ActivityPrivateExclusion?> BuildPrivateExclusionAsync(Guid userId, CancellationToken ct)
    {
        var foreign = await uow.Groups.ListAsync(
            g => g.IsPrivate && g.OwnerUserId != userId, ct);
        if (foreign.Count == 0) return null;
        var groupIds = foreign.Select(g => g.Id).ToHashSet();
        var files = await uow.Files.ListAsync(f => groupIds.Contains(f.GroupId), ct);
        return new ActivityPrivateExclusion(
            groupIds.Select(id => id.ToString("D")).ToArray(),
            foreign.Select(g => g.Name).Distinct(StringComparer.Ordinal).ToArray(),
            files.Select(f => f.Id.ToString("D")).Distinct().ToArray(),
            files.Select(f => " — " + f.Name).Distinct(StringComparer.Ordinal).ToArray());
    }

    private static bool IsFileAction(ActivityAction action) => action is
        ActivityAction.FileUploaded or ActivityAction.FileUpdated or
        ActivityAction.FileReplaced or ActivityAction.FileDeleted or
        ActivityAction.FileVersionBumped;

    /// <summary>Historical fileId from the details JSON ("fileId" or
    /// "previousFileId"); null when the event has no file link.</summary>
    private static Guid? FileIdFrom(System.Text.Json.JsonDocument? doc)
    {
        if (doc is null || doc.RootElement.ValueKind != JsonValueKind.Object) return null;
        var root = doc.RootElement;
        foreach (var key in new[] { "fileId", "previousFileId" })
        {
            if (root.TryGetProperty(key, out var prop) && prop.ValueKind == JsonValueKind.String
                && Guid.TryParse(prop.GetString(), out var id))
                return id;
        }
        return null;
    }

    /// <summary>Stored version from details ("fileVersion" for new
    /// record edits/deletes, "version"/"newVersion" for file events).</summary>
    private static int? StoredVersion(IReadOnlyDictionary<string, object?> details)
    {
        foreach (var key in new[] { "fileVersion", "version", "newVersion" })
        {
            if (!details.TryGetValue(key, out var value)) continue;
            if (value is long l) return (int)l;
            if (value is int i) return i;
            if (value is string s && int.TryParse(s, out var parsed)) return parsed;
            try
            {
                var raw = value?.ToString();
                if (raw is not null && int.TryParse(raw.Trim('"'), out var fromRaw)) return fromRaw;
            }
            catch { /* ignore malformed stored versions */ }
        }
        return null;
    }

    /// <summary>Extracts the acting user from event details across the set of
    /// detail keys written by services (by / editedBy / visitorUsername / user).
    /// Returns null for background events that record no actor.</summary>
    private static string? ResolveActor(IReadOnlyDictionary<string, object?> details)
    {
        foreach (var key in ActorDetailKeys)
            if (details.TryGetValue(key, out var value) && value is string s && !string.IsNullOrWhiteSpace(s))
                return s;
        return null;
    }

    private static readonly string[] ActorDetailKeys = ["by", "editedBy", "visitorUsername", "user", "username"];

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
