using System.Text.Json;
using ExcelArchive.Application.Services;
using ClosedXML.Excel;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.UserDto;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Infrastructure.Implementations.Excel;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;
using FileEntity = ExcelArchive.Domain.Entities.File;
using RecordEntity = ExcelArchive.Domain.Entities.Record;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P8.2 cutover rehearsal into a disposable target (InMemory; a live
/// PostgreSQL rehearsal needs the fixture host): full archive + accounts
/// transfer preserving IDs, then migrated login, search-readiness and export
/// verified on the target. Rollback is proven by re-restoring the
/// pre-cutover snapshot.</summary>
public sealed class CutoverRehearsalP8Tests
{
    private static AppDbContext Db() => TestHelpers.InMemoryDb();

    private static BackupService Backup(AppDbContext db) => TestHelpers.BackupSvc(db);

    private static UserService Users(AppDbContext db) =>
        new(TestHelpers.Uow(db), TestHelpers.Auth(db), new ActivityService(TestHelpers.Uow(db)));

    private static async Task<(Guid GroupId, Guid FileId, Guid RecordId)> SeedSource(AppDbContext db)
    {
        var group = new Group { Name = "cutover-g" + Guid.NewGuid().ToString("N")[..6] };
        db.Groups.Add(group);
        await db.SaveChangesAsync();
        var file = new FileEntity
        {
            GroupId = group.Id, Name = "cutover-f" + Guid.NewGuid().ToString("N")[..6],
            OriginalFilename = "source.xlsx", SheetName = "البيانات",
        };
        db.Files.Add(file);
        await db.SaveChangesAsync();
        db.FileColumns.AddRange(
            new FileColumn { FileId = file.Id, HeaderRaw = "الاسم الثلاثي", HeaderNormalized = "الاسم الثلاثي", ColumnIndex = 1, StandardField = StandardField.FullName },
            new FileColumn { FileId = file.Id, HeaderRaw = "الرقم الوطني", HeaderNormalized = "الرقم الوطني", ColumnIndex = 2, StandardField = StandardField.NationalId },
            new FileColumn { FileId = file.Id, HeaderRaw = "اسم الأم", HeaderNormalized = "اسم الأم", ColumnIndex = 3, StandardField = StandardField.MotherName });
        await db.SaveChangesAsync();
        var data = new Dictionary<string, string>
        {
            ["الاسم الثلاثي"] = "أحمد محمد علي",
            ["الرقم الوطني"] = "123456789",
            ["اسم الأم"] = "فاطمة",
        };
        var record = new RecordEntity
        {
            FileId = file.Id, RowIndex = 2,
            Data = JsonDocument.Parse(JsonSerializer.Serialize(data)),
            SfFullName = "أحمد محمد علي",
            SfNationalId = 123456789,
            DNationalId = "00123456789",
            NationalIdNum = 123456789,
            SfMotherName = "فاطمة",
        };
        db.Records.Add(record);
        await db.SaveChangesAsync();

        var users = Users(db);
        await users.CreateAsync(
            new CreateUserRequest("cutowner", "owner-secret-1", "Owner", true,
                [new PermissionAssignmentDto("users.view", null, null)]), "admin");
        await users.CreateAsync(
            new CreateUserRequest("cutscoped", "scoped-secret-2", null, true,
                [new PermissionAssignmentDto("groups.viewScoped", null, file.Id)]), "admin");
        db.IgnoredConflicts.Add(new IgnoredConflict { Rule = "missing_national", RecordId = record.Id });
        await db.SaveChangesAsync();
        return (group.Id, file.Id, record.Id);
    }

    [Fact]
    public async Task FullJourney_TransferPreservesIds_LoginSearchExportVerify()
    {
        using var source = Db();
        var (groupId, fileId, recordId) = await SeedSource(source);
        var archiveBytes = await Backup(source).ExportAsync();
        var accountsBytes = await Backup(source).ExportAccountsAsync();

        // Disposable target (fresh, empty).
        using var target = Db();
        var archiveSummary = await Backup(target).RestoreAsync(new MemoryStream(archiveBytes), "cutover");
        Assert.Equal(1, archiveSummary["groups"]);
        Assert.Equal(1, archiveSummary["files"]);
        Assert.Equal(1, archiveSummary["records"]);
        var accountsSummary = await Backup(target).ImportAccountsAsync(new MemoryStream(accountsBytes), "cutover");
        Assert.Equal(2, accountsSummary["users"]);

        // IDs preserved across the transfer.
        Assert.NotNull(await target.Groups.SingleOrDefaultAsync(g => g.Id == groupId));
        Assert.NotNull(await target.Files.SingleOrDefaultAsync(f => f.Id == fileId));
        var migratedRecord = await target.Records.SingleOrDefaultAsync(r => r.Id == recordId);
        Assert.NotNull(migratedRecord);

        // Login: both migrated accounts verify with original passwords and can
        // be issued session tokens (no password reset at cutover).
        var auth = TestHelpers.Auth(target);
        var owner = await target.Users.SingleAsync(u => u.Username == "cutowner");
        var scoped = await target.Users.SingleAsync(u => u.Username == "cutscoped");
        Assert.True(auth.VerifyPassword("owner-secret-1", owner.PasswordHash));
        Assert.True(auth.VerifyPassword("scoped-secret-2", scoped.PasswordHash));
        Assert.False(string.IsNullOrWhiteSpace(auth.CreateSessionToken(owner)));
        Assert.False(string.IsNullOrWhiteSpace(auth.CreateSessionToken(scoped)));

        // Search-readiness: shadow/normalized layers the search engine reads
        // survived the transfer byte-identical, and the scoped grant resolves
        // to the migrated file (snapshot semantics).
        Assert.Equal("أحمد محمد علي", migratedRecord.SfFullName);
        Assert.Equal(123456789, migratedRecord.SfNationalId);
        Assert.Equal("00123456789", migratedRecord.DNationalId);
        Assert.Equal(123456789, migratedRecord.NationalIdNum);
        var grant = await target.UserPermissions
            .SingleAsync(p => p.UserId == scoped.Id && p.Permission == "groups.viewScoped");
        Assert.Equal(fileId, grant.FileId);

        // Export: rebuild the file workbook from migrated rows and parse it.
        var file = await target.Files
            .Include(f => f.Columns.OrderBy(c => c.ColumnIndex))
            .SingleAsync(f => f.Id == fileId);
        var records = await target.Records.AsNoTracking()
            .Where(r => r.FileId == fileId).OrderBy(r => r.RowIndex).ToListAsync();
        var bytes = FileExportBuilder.Build(
            file.SheetName,
            file.Columns.Select(c => c.HeaderRaw).ToList(),
            records.Select(r => new ExportRecord(r.Id, r.RowIndex,
                r.Data!.RootElement.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString() ?? ""),
                null, null)).ToList(),
            []);
        using var wb = new XLWorkbook(new MemoryStream(bytes));
        var ws = wb.Worksheets.Single();
        Assert.Equal(2, ws.LastRowUsed()!.RowNumber()); // header + 1 migrated row
        Assert.Equal("أحمد محمد علي", ws.Cell(2, 1).GetString());
        Assert.Equal("123456789", ws.Cell(2, 2).GetString());

        // Ignores reference live migrated records.
        var ignore = await target.IgnoredConflicts.SingleAsync();
        Assert.Equal("missing_national", ignore.Rule);
        Assert.Equal(recordId, ignore.RecordId);
    }

    [Fact]
    public async Task Rollback_PreCutoverSnapshotRestores_TargetKeepsLogin()
    {
        using var target = Db();
        var marker = new Group { Name = "pre-cutover-marker" };
        target.Groups.Add(marker);
        await target.SaveChangesAsync();
        await Users(target).CreateAsync(
            new CreateUserRequest("rollback-admin", "rollback-secret-1", null, true,
                [new PermissionAssignmentDto("users.view", null, null)]), "admin");
        var snapshotBytes = await Backup(target).ExportAsync();

        // Cutover happens…
        using var source = Db();
        var (_, _, _) = await SeedSource(source);
        await Backup(target).RestoreAsync(new MemoryStream(await Backup(source).ExportAsync()), "cutover");
        await Backup(target).ImportAccountsAsync(new MemoryStream(await Backup(source).ExportAccountsAsync()), "cutover");
        // Archive restore is a replacement (not additive): the target now
        // holds exactly the source's group; the marker is gone until rollback.
        Assert.Equal(1, await target.Groups.CountAsync());

        // …then rollback re-restores the pre-cutover snapshot.
        await Backup(target).RestoreAsync(new MemoryStream(snapshotBytes), "rollback");
        Assert.NotNull(await target.Groups.SingleOrDefaultAsync(g => g.Id == marker.Id));
        Assert.Equal(1, await target.Groups.CountAsync());
        // Archive restore preserves accounts: pre-existing login still works.
        var admin = await target.Users.SingleAsync(u => u.Username == "rollback-admin");
        Assert.True(TestHelpers.Auth(target).VerifyPassword("rollback-secret-1", admin.PasswordHash));
    }
}
