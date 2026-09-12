using System.Text.Json;
using ExcelArchive.Application.Services;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;
using FileEntity = ExcelArchive.Domain.Entities.File;
using RecordEntity = ExcelArchive.Domain.Entities.Record;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P6.3: V1 archive envelope (schemaVersion/exportedAt/application/
/// data, ten arrays, bigint strings), historical recompute, nonterminal jobs
/// failed, archive-only transactional restore (users survive), malformed
/// input leaves the database unchanged.</summary>
public sealed class BackupPhase6Tests
{
    private static AppDbContext Db() => TestHelpers.InMemoryDb();

    private static BackupService Svc(AppDbContext db) => TestHelpers.BackupSvc(db);

    private static async Task SeedArchive(AppDbContext db, string national = "123456789")
    {
        var group = new Group { Name = "bg" + Guid.NewGuid().ToString("N")[..6] };
        db.Groups.Add(group);
        await db.SaveChangesAsync();
        var category = new Category { Name = "bc" + Guid.NewGuid().ToString("N")[..6] };
        db.Categories.Add(category);
        await db.SaveChangesAsync();
        var file = new FileEntity
        {
            GroupId = group.Id, Name = "bf" + Guid.NewGuid().ToString("N")[..6],
            OriginalFilename = "o.xlsx", SheetName = "S",
        };
        db.Files.Add(file);
        await db.SaveChangesAsync();
        db.FileColumns.Add(new FileColumn
        {
            FileId = file.Id, HeaderRaw = "national", HeaderNormalized = "national",
            ColumnIndex = 1, StandardField = StandardField.NationalId,
        });
        await db.SaveChangesAsync();
        var record = new RecordEntity
        {
            FileId = file.Id, RowIndex = 2,
            Data = JsonDocument.Parse($"{{\"national\":\"{national}\"}}"),
            SfNationalId = 123456789, DNationalId = "00123456789", NationalIdNum = 123456789,
        };
        db.Records.Add(record);
        await db.SaveChangesAsync();
        db.DataQualityIssues.Add(new DataQualityIssue
        {
            FileId = file.Id, RowIndex = 2, IssueType = DataQualityIssueType.MissingNationalId,
        });
        db.UploadJobs.Add(new UploadJob
        {
            FileId = file.Id, Status = UploadJobStatus.Pending,
            Payload = JsonDocument.Parse("{}"),
        });
        db.RecordEdits.Add(new RecordEdit
        {
            RecordId = record.Id, FileId = file.Id, HeaderRaw = "national",
            OldValue = "a", NewValue = "b",
        });
        db.MappingTemplates.Add(new MappingTemplate
        {
            GroupId = group.Id, Name = "t", HeaderSignature = "s",
            Mapping = JsonDocument.Parse("{}"),
        });
        db.ActivityLogs.Add(new ActivityLog
        {
            Action = ActivityAction.FileUploaded, TargetName = "x",
            Details = JsonDocument.Parse("{}"),
        });
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Export_V1Envelope_BigintsAsStrings()
    {
        using var db = Db();
        await SeedArchive(db);
        var bytes = await Svc(db).ExportAsync();
        using var doc = JsonDocument.Parse(bytes);
        var root = doc.RootElement;
        Assert.Equal(1, root.GetProperty("schemaVersion").GetInt32());
        Assert.Equal("excel-archive-search", root.GetProperty("application").GetString());
        Assert.Equal(JsonValueKind.String, root.GetProperty("exportedAt").ValueKind);
        var data = root.GetProperty("data");
        foreach (var table in new[] { "groups", "categories", "files", "fileColumns", "records",
            "dataQualityIssues", "mappingTemplates", "uploadJobs", "activityLogs", "recordEdits" })
            Assert.Equal(JsonValueKind.Array, data.GetProperty(table).ValueKind);
        // Archive envelope carries no accounts, grants or ignored conflicts.
        Assert.False(data.TryGetProperty("users", out _));
        Assert.False(data.TryGetProperty("userPermissions", out _));
        Assert.False(data.TryGetProperty("ignoredConflicts", out _));
        var record = data.GetProperty("records").EnumerateArray().First();
        Assert.Equal("123456789", record.GetProperty("sfNationalId").GetString());
        Assert.Equal("PENDING", data.GetProperty("uploadJobs").EnumerateArray().First().GetProperty("status").GetString());
        Assert.Equal("MISSING_NATIONAL_ID",
            data.GetProperty("dataQualityIssues").EnumerateArray().First().GetProperty("issueType").GetString());
        Assert.Equal("NATIONAL_ID",
            data.GetProperty("fileColumns").EnumerateArray().First().GetProperty("standardField").GetString());
    }

    [Fact]
    public async Task RoundTrip_PreservesCounts_FailsPendingJob_RecomputesNational()
    {
        using var db = Db();
        await SeedArchive(db);
        var bytes = await Svc(db).ExportAsync();
        var summary = await Svc(db).RestoreAsync(new MemoryStream(bytes), "tester");
        Assert.Equal(1, summary["groups"]);
        Assert.Equal(1, summary["files"]);
        Assert.Equal(1, summary["records"]);
        Assert.Equal(1, await db.Groups.CountAsync());
        Assert.Equal(1, await db.Records.CountAsync());
        var job = await db.UploadJobs.SingleAsync();
        Assert.Equal(UploadJobStatus.Failed, job.Status);
        Assert.Equal("أوقفت المهمة عند استعادة النسخة الاحتياطية.", job.ErrorMessage);
        Assert.NotNull(job.FinishedAt);
        var record = await db.Records.SingleAsync();
        Assert.Equal(123456789, record.NationalIdNum);
        Assert.Equal("00123456789", record.DNationalId);
        // Stored national issues were dropped and rebuilt from originals.
        var issues = await db.DataQualityIssues.ToListAsync();
        Assert.DoesNotContain(issues, i => i.IssueType == DataQualityIssueType.MissingNationalId);
        Assert.Contains(await db.ActivityLogs.Select(a => a.Action).ToListAsync(), a => a == ActivityAction.BackupRestored);
    }

    [Fact]
    public async Task Restore_V1MinimalFixture_RecomputesInvalidNational()
    {
        using var db = Db();
        var groupId = Guid.NewGuid();
        var fileId = Guid.NewGuid();
        var columnId = Guid.NewGuid();
        var recordId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var envelope = new
        {
            schemaVersion = 1,
            exportedAt = now,
            application = "excel-archive-search",
            data = new
            {
                groups = new[] { new { id = groupId, name = "g", description = "", sortOrder = 0, createdAt = now, updatedAt = now } },
                categories = Array.Empty<object>(),
                files = new[] { new { id = fileId, groupId, name = "f", description = "", originalFilename = "o.xlsx", sheetName = "S", rowCount = 1, columnSignature = "s", version = 1, uploadedAt = now, updatedAt = now } },
                fileColumns = new[] { new { id = columnId, fileId, headerRaw = "national", headerNormalized = "national", columnIndex = 1, categoryId = (Guid?)null, standardField = "NATIONAL_ID", createdAt = now } },
                records = new[] { new { id = recordId, fileId, rowIndex = 2, data = new { national = "abc" }, createdAt = now } },
                dataQualityIssues = new[] { new { id = Guid.NewGuid(), fileId, rowIndex = 2, issueType = "MISSING_NATIONAL_ID", columnName = (string?)null, rawValue = (string?)null, createdAt = now } },
                mappingTemplates = Array.Empty<object>(),
                uploadJobs = Array.Empty<object>(),
                activityLogs = Array.Empty<object>(),
            },
        };
        var bytes = JsonSerializer.SerializeToUtf8Bytes(envelope);
        var summary = await Svc(db).RestoreAsync(new MemoryStream(bytes), "tester");
        Assert.Equal(1, summary["records"]);
        var record = await db.Records.SingleAsync(r => r.Id == recordId);
        Assert.Null(record.NationalIdNum);
        // Legacy rows without sortOrder fall back to the physical column index.
        var column = await db.FileColumns.SingleAsync(c => c.Id == columnId);
        Assert.Equal(1, column.SortOrder);
        Assert.Equal(StandardField.NationalId, column.StandardField);
        var issue = Assert.Single(await db.DataQualityIssues.ToListAsync());
        Assert.Equal(DataQualityIssueType.InvalidNationalId, issue.IssueType);
        Assert.Equal("الرقم الوطني", issue.ColumnName);
    }

    [Theory]
    [InlineData("""{"schemaVersion":2,"exportedAt":"2026-01-01T00:00:00Z","application":"excel-archive-search","data":{}}""")]
    [InlineData("""{"schemaVersion":1,"exportedAt":"2026-01-01T00:00:00Z","application":"other-app","data":{}}""")]
    [InlineData("""{"schemaVersion":1,"exportedAt":"2026-01-01T00:00:00Z","application":"excel-archive-search"}""")]
    [InlineData("""{"version":1,"generatedAt":"2026-01-01T00:00:00Z"}""")]
    public async Task Restore_BadEnvelope_LeavesDbUnchanged(string json)
    {
        using var db = Db();
        await SeedArchive(db);
        var before = await db.Records.CountAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(db).RestoreAsync(new MemoryStream(System.Text.Encoding.UTF8.GetBytes(json)), "tester"));
        Assert.Equal(before, await db.Records.CountAsync());
        Assert.Equal(1, await db.Groups.CountAsync());
    }

    [Fact]
    public async Task Restore_DanglingReference_LeavesDbUnchanged()
    {
        using var db = Db();
        await SeedArchive(db);
        var now = DateTime.UtcNow;
        var envelope = new
        {
            schemaVersion = 1,
            exportedAt = now,
            application = "excel-archive-search",
            data = new
            {
                groups = Array.Empty<object>(),
                categories = Array.Empty<object>(),
                files = new[] { new { id = Guid.NewGuid(), groupId = Guid.NewGuid(), name = "f", description = "", originalFilename = "o", sheetName = "S", rowCount = 0, columnSignature = "", version = 1, uploadedAt = now, updatedAt = now } },
                fileColumns = Array.Empty<object>(),
                records = Array.Empty<object>(),
                dataQualityIssues = Array.Empty<object>(),
                mappingTemplates = Array.Empty<object>(),
                uploadJobs = Array.Empty<object>(),
                activityLogs = Array.Empty<object>(),
            },
        };
        var bytes = JsonSerializer.SerializeToUtf8Bytes(envelope);
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(db).RestoreAsync(new MemoryStream(bytes), "tester"));
        Assert.Equal(1, await db.Files.CountAsync());
    }

    [Fact]
    public async Task Restore_TooManyCategories_Rejected()
    {
        using var db = Db();
        var now = DateTime.UtcNow.ToString("O");
        var cats = string.Join(",", Enumerable.Range(0, 8).Select(i =>
            $"{{\"id\":\"{Guid.NewGuid()}\",\"name\":\"c{i}\",\"sortOrder\":{i},\"createdAt\":\"{now}\"}}"));
        var json = $"{{\"schemaVersion\":1,\"exportedAt\":\"{now}\",\"application\":\"excel-archive-search\",\"data\":{{\"groups\":[],\"categories\":[{cats}],\"files\":[],\"fileColumns\":[],\"records\":[],\"dataQualityIssues\":[],\"mappingTemplates\":[],\"uploadJobs\":[],\"activityLogs\":[]}}}}";
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => Svc(db).RestoreAsync(new MemoryStream(System.Text.Encoding.UTF8.GetBytes(json)), "tester"));
        Assert.Equal(CategoryService.LimitMessage, ex.Message);
    }

    [Fact]
    public async Task Restore_UsersSurvive_GrantsReconciledToArchive()
    {
        using var db = Db();
        await SeedArchive(db);
        var file = await db.Files.SingleAsync();
        var user = new User { Username = "keeper", PasswordHash = "scrypt$v1$stub" };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        db.UserPermissions.Add(new UserPermission
            { UserId = user.Id, Permission = "groups.viewScoped", FileId = file.Id });
        db.UserPermissions.Add(new UserPermission
            { UserId = user.Id, Permission = "users.view" });
        await db.SaveChangesAsync();
        var bytes = await Svc(db).ExportAsync();
        await Svc(db).RestoreAsync(new MemoryStream(bytes), "tester");
        // Account (including its hash) survives ordinary archive restore.
        var kept = await db.Users.SingleAsync(u => u.Username == "keeper");
        Assert.Equal("scrypt$v1$stub", kept.PasswordHash);
        // Scoped grants die with the wiped archive rows (V1 cascade); the
        // global grant survives. The separate accounts transfer (P6.4)
        // restores scoped access explicitly.
        var grants = await db.UserPermissions.Where(p => p.UserId == user.Id).ToListAsync();
        var remaining = Assert.Single(grants);
        Assert.Equal("users.view", remaining.Permission);
    }
}
