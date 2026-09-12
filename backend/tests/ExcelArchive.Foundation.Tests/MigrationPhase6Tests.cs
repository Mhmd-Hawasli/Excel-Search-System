using System.Text.Json;
using ExcelArchive.Application.Services;
using ExcelArchive.Application.Common;
using ExcelArchive.Application.DTOs.UserDto;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;
using FileEntity = ExcelArchive.Domain.Entities.File;
using RecordEntity = ExcelArchive.Domain.Entities.Record;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P6.4: protected accounts/grants/ignores transfer — export shape,
/// full rehearsal (archive restore + accounts import with preserved IDs,
/// login-compatible hashes and resolvable scopes), collision safety and
/// dangling-reference rejection.</summary>
public sealed class MigrationPhase6Tests
{
    private static AppDbContext Db() => TestHelpers.InMemoryDb();

    private static BackupService Backup(AppDbContext db) => TestHelpers.BackupSvc(db);

    private static UserService Users(AppDbContext db) =>
        new(TestHelpers.Uow(db), TestHelpers.Auth(db), new ActivityService(TestHelpers.Uow(db)));

    private static async Task<(Guid FileId, Guid RecordId)> SeedArchive(AppDbContext db)
    {
        var group = new Group { Name = "mg" + Guid.NewGuid().ToString("N")[..6] };
        db.Groups.Add(group);
        await db.SaveChangesAsync();
        var file = new FileEntity
        {
            GroupId = group.Id, Name = "mf" + Guid.NewGuid().ToString("N")[..6], SheetName = "S",
        };
        db.Files.Add(file);
        await db.SaveChangesAsync();
        var record = new RecordEntity
        {
            FileId = file.Id, RowIndex = 2, Data = JsonDocument.Parse("{}"),
            SfNationalId = 123456789, DNationalId = "00123456789", NationalIdNum = 123456789,
        };
        db.Records.Add(record);
        await db.SaveChangesAsync();
        return (file.Id, record.Id);
    }

    private static async Task SeedAccounts(AppDbContext db, Guid fileId, Guid recordId)
    {
        var users = Users(db);
        var owner = await users.CreateAsync(
            new CreateUserRequest("mowner", "owner-secret-1", "Owner", true,
                [new PermissionAssignmentDto("users.view", null, null)]), "admin");
        var scoped = await users.CreateAsync(
            new CreateUserRequest("mscoped", "scoped-secret-2", null, true,
                [new PermissionAssignmentDto("groups.viewScoped", null, fileId)]), "admin");
        db.IgnoredConflicts.Add(new IgnoredConflict { Rule = "missing_national", RecordId = recordId });
        await db.SaveChangesAsync();
        _ = (owner, scoped);
    }

    [Fact]
    public async Task ExportAccounts_ShapeSeparatesArchive()
    {
        using var db = Db();
        var (fileId, recordId) = await SeedArchive(db);
        await SeedAccounts(db, fileId, recordId);
        var bytes = await Backup(db).ExportAccountsAsync();
        using var doc = JsonDocument.Parse(bytes);
        var root = doc.RootElement;
        Assert.Equal(1, root.GetProperty("schemaVersion").GetInt32());
        Assert.Equal("excel-archive-search-accounts", root.GetProperty("application").GetString());
        var data = root.GetProperty("data");
        Assert.Equal(2, data.GetProperty("users").GetArrayLength());
        Assert.Equal(2, data.GetProperty("userPermissions").GetArrayLength());
        Assert.Single(data.GetProperty("ignoredConflicts").EnumerateArray());
        var user = data.GetProperty("users").EnumerateArray().First();
        Assert.True(user.TryGetProperty("passwordHash", out _));
    }

    [Fact]
    public async Task Rehearsal_ArchiveThenAccounts_PreservesIdsLoginAndScope()
    {
        using var source = Db();
        var (fileId, recordId) = await SeedArchive(source);
        await SeedAccounts(source, fileId, recordId);
        var archiveBytes = await Backup(source).ExportAsync();
        var accountsBytes = await Backup(source).ExportAccountsAsync();

        using var target = Db();
        var archiveSummary = await Backup(target).RestoreAsync(new MemoryStream(archiveBytes), "rehearsal");
        Assert.Equal(1, archiveSummary["files"]);
        var accountsSummary = await Backup(target).ImportAccountsAsync(new MemoryStream(accountsBytes), "rehearsal");
        Assert.Equal(2, accountsSummary["users"]);
        Assert.Equal(2, accountsSummary["userPermissions"]);
        Assert.Equal(1, accountsSummary["ignoredConflicts"]);

        // IDs preserved across the transfer.
        var ownerId = await source.Users.Where(u => u.Username == "mowner").Select(u => u.Id).SingleAsync();
        Assert.NotNull(await target.Users.SingleOrDefaultAsync(u => u.Id == ownerId));
        // Login-compatible hashes: the migrated password still verifies.
        var migrated = await target.Users.SingleAsync(u => u.Username == "mscoped");
        Assert.True(TestHelpers.Auth(target).VerifyPassword("scoped-secret-2", migrated.PasswordHash));
        Assert.False(migrated.IsActive == false);
        // Scope grants resolve against the restored archive.
        var grant = await target.UserPermissions
            .SingleAsync(p => p.UserId == migrated.Id && p.Permission == "groups.viewScoped");
        Assert.Equal(fileId, grant.FileId);
        Assert.NotNull(await target.Files.SingleOrDefaultAsync(f => f.Id == grant.FileId));
        // Ignored conflicts reference live records.
        var ignore = await target.IgnoredConflicts.SingleAsync();
        Assert.Equal("missing_national", ignore.Rule);
        Assert.NotNull(await target.Records.SingleOrDefaultAsync(r => r.Id == ignore.RecordId));
        // Second import collides explicitly instead of duplicating.
        var collision = await Assert.ThrowsAsync<ConflictException>(() =>
            Backup(target).ImportAccountsAsync(new MemoryStream(accountsBytes), "rehearsal"));
        Assert.Contains("mowner", collision.Message);
        Assert.Equal(2, await target.Users.CountAsync());
    }

    [Fact]
    public async Task Import_DanglingFileGrant_RejectedAtomically()
    {
        using var source = Db();
        var (fileId, recordId) = await SeedArchive(source);
        await SeedAccounts(source, fileId, recordId);
        var accountsBytes = await Backup(source).ExportAccountsAsync();

        using var target = Db(); // Empty archive: referenced files absent.
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Backup(target).ImportAccountsAsync(new MemoryStream(accountsBytes), "rehearsal"));
        Assert.Equal("إحدى المجموعات أو الملفات المرجعية في الترحيل غير موجودة في الأرشيف المستهدف.", ex.Message);
        Assert.Equal(0, await target.Users.CountAsync());
        Assert.Equal(0, await target.UserPermissions.CountAsync());
    }

    [Fact]
    public async Task Import_WrongEnvelope_Rejected()
    {
        using var db = Db();
        var archiveBytes = await Backup(db).ExportAsync(); // Archive, not accounts.
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Backup(db).ImportAccountsAsync(new MemoryStream(archiveBytes), "rehearsal"));
    }
}
