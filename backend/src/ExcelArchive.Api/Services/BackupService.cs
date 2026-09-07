using System.Text.Json;
using ExcelArchive.Api.Data;
using ExcelArchive.Api.Models.Enums;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Services;

public class BackupService(AppDbContext db, IActivityService activity) : IBackupService
{
    public async Task<byte[]> ExportAsync(CancellationToken ct = default)
    {
        var payload = new
        {
            version = 1,
            generatedAt = DateTime.UtcNow,
            groups = await db.Groups.AsNoTracking().ToListAsync(ct),
            files = await db.Files.AsNoTracking().ToListAsync(ct),
            categories = await db.Categories.AsNoTracking().ToListAsync(ct),
            fileColumns = await db.FileColumns.AsNoTracking().ToListAsync(ct),
            records = await db.Records.AsNoTracking().ToListAsync(ct),
            uploadJobs = await db.UploadJobs.AsNoTracking().ToListAsync(ct),
            dataQualityIssues = await db.DataQualityIssues.AsNoTracking().ToListAsync(ct),
            activityLogs = await db.ActivityLogs.AsNoTracking().ToListAsync(ct),
            recordEdits = await db.RecordEdits.AsNoTracking().ToListAsync(ct),
            mappingTemplates = await db.MappingTemplates.AsNoTracking().ToListAsync(ct),
            ignoredConflicts = await db.IgnoredConflicts.AsNoTracking().ToListAsync(ct),
            users = await db.Users.AsNoTracking().ToListAsync(ct),
            userPermissions = await db.UserPermissions.AsNoTracking().ToListAsync(ct),
        };
        return JsonSerializer.SerializeToUtf8Bytes(payload, new JsonSerializerOptions { WriteIndented = true });
    }

    public async Task<IReadOnlyDictionary<string, int>> RestoreAsync(Stream jsonStream, string actorUsername, CancellationToken ct = default)
    {
        // A restore is a full replacement. We intentionally keep it simple and
        // explicit: remove in dependency order, then re-insert from the JSON.
        var backup = await JsonSerializer.DeserializeAsync<System.Text.Json.JsonElement>(jsonStream, cancellationToken: ct);
        if (backup.ValueKind != JsonValueKind.Object) throw new InvalidOperationException("ملف النسخة غير صالح.");

        var counts = new Dictionary<string, int>();
        await ClearDatabaseAsync(ct);

        var groups = backup.TryGetProperty("groups", out var g) ? g.EnumerateArray().ToList() : [];
        var files = backup.TryGetProperty("files", out var f) ? f.EnumerateArray().ToList() : [];
        var categories = backup.TryGetProperty("categories", out var c) ? c.EnumerateArray().ToList() : [];
        var fileColumns = backup.TryGetProperty("fileColumns", out var fc) ? fc.EnumerateArray().ToList() : [];
        var records = backup.TryGetProperty("records", out var r) ? r.EnumerateArray().ToList() : [];
        var uploadJobs = backup.TryGetProperty("uploadJobs", out var uj) ? uj.EnumerateArray().ToList() : [];
        var dataQualityIssues = backup.TryGetProperty("dataQualityIssues", out var dq) ? dq.EnumerateArray().ToList() : [];
        var activityLogs = backup.TryGetProperty("activityLogs", out var al) ? al.EnumerateArray().ToList() : [];
        var recordEdits = backup.TryGetProperty("recordEdits", out var re) ? re.EnumerateArray().ToList() : [];
        var mappingTemplates = backup.TryGetProperty("mappingTemplates", out var mt) ? mt.EnumerateArray().ToList() : [];
        var ignoredConflicts = backup.TryGetProperty("ignoredConflicts", out var ic) ? ic.EnumerateArray().ToList() : [];
        var users = backup.TryGetProperty("users", out var u) ? u.EnumerateArray().ToList() : [];
        var userPermissions = backup.TryGetProperty("userPermissions", out var up) ? up.EnumerateArray().ToList() : [];

        await db.Groups.AddRangeAsync(groups.Select(e => e.Deserialize<Models.Entities.Group>()!).ToList(), ct);
        await db.Files.AddRangeAsync(files.Select(e => e.Deserialize<Models.Entities.File>()!).ToList(), ct);
        await db.Categories.AddRangeAsync(categories.Select(e => e.Deserialize<Models.Entities.Category>()!).ToList(), ct);
        await db.FileColumns.AddRangeAsync(fileColumns.Select(e => e.Deserialize<Models.Entities.FileColumn>()!).ToList(), ct);
        await db.Records.AddRangeAsync(records.Select(e => e.Deserialize<Models.Entities.Record>()!).ToList(), ct);
        await db.UploadJobs.AddRangeAsync(uploadJobs.Select(e => e.Deserialize<Models.Entities.UploadJob>()!).ToList(), ct);
        await db.DataQualityIssues.AddRangeAsync(dataQualityIssues.Select(e => e.Deserialize<Models.Entities.DataQualityIssue>()!).ToList(), ct);
        await db.ActivityLogs.AddRangeAsync(activityLogs.Select(e => e.Deserialize<Models.Entities.ActivityLog>()!).ToList(), ct);
        await db.RecordEdits.AddRangeAsync(recordEdits.Select(e => e.Deserialize<Models.Entities.RecordEdit>()!).ToList(), ct);
        await db.MappingTemplates.AddRangeAsync(mappingTemplates.Select(e => e.Deserialize<Models.Entities.MappingTemplate>()!).ToList(), ct);
        await db.IgnoredConflicts.AddRangeAsync(ignoredConflicts.Select(e => e.Deserialize<Models.Entities.IgnoredConflict>()!).ToList(), ct);
        await db.Users.AddRangeAsync(users.Select(e => e.Deserialize<Models.Entities.User>()!).ToList(), ct);
        await db.UserPermissions.AddRangeAsync(userPermissions.Select(e => e.Deserialize<Models.Entities.UserPermission>()!).ToList(), ct);
        await db.SaveChangesAsync(ct);

        counts["groups"] = groups.Count;
        counts["files"] = files.Count;
        counts["categories"] = categories.Count;
        counts["records"] = records.Count;
        counts["users"] = users.Count;
        counts["userPermissions"] = userPermissions.Count;

        await activity.WriteAsync(ActivityAction.BackupRestored, "النسخة الاحتياطية", new { by = actorUsername }, ct);
        return counts;
    }

    private async Task ClearDatabaseAsync(CancellationToken ct)
    {
        db.IgnoredConflicts.RemoveRange(await db.IgnoredConflicts.ToListAsync(ct));
        db.RecordEdits.RemoveRange(await db.RecordEdits.ToListAsync(ct));
        db.MappingTemplates.RemoveRange(await db.MappingTemplates.ToListAsync(ct));
        db.DataQualityIssues.RemoveRange(await db.DataQualityIssues.ToListAsync(ct));
        db.UploadJobs.RemoveRange(await db.UploadJobs.ToListAsync(ct));
        db.Records.RemoveRange(await db.Records.ToListAsync(ct));
        db.FileColumns.RemoveRange(await db.FileColumns.ToListAsync(ct));
        db.Files.RemoveRange(await db.Files.ToListAsync(ct));
        db.Categories.RemoveRange(await db.Categories.ToListAsync(ct));
        db.Groups.RemoveRange(await db.Groups.ToListAsync(ct));
        db.UserPermissions.RemoveRange(await db.UserPermissions.ToListAsync(ct));
        db.Users.RemoveRange(await db.Users.ToListAsync(ct));
        db.ActivityLogs.RemoveRange(await db.ActivityLogs.ToListAsync(ct));
        await db.SaveChangesAsync(ct);
    }
}
