using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Services;
using ExcelArchive.Application.Common;
using ExcelArchive.Application.DTOs.UserDto;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using FileEntity = ExcelArchive.Domain.Entities.File;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P6.2: user validation (400 shapes, 409 duplicate, 422 targets),
/// file-grant snapshot semantics (new files NOT auto-granted) and PATCH
/// presence semantics. Mirrors V1 users/validation + users routes.</summary>
public sealed class UserPhase6Tests
{
    private static (AppDbContext Db, UserService Svc) Setup()
    {
        var db = TestHelpers.InMemoryDb();
        var auth = TestHelpers.Auth(db);
        return (db, new UserService(TestHelpers.Uow(db), auth, new ActivityService(TestHelpers.Uow(db))));
    }

    private static DataScopeDto OpenScope() => new() { GroupIds = null, FileIds = null };

    private static async Task<(Guid GroupId, Guid FileId)> SeedFile(AppDbContext db, string? name = null)
    {
        var group = new Group { Name = "ug" + Guid.NewGuid().ToString("N")[..6] };
        db.Groups.Add(group);
        await db.SaveChangesAsync();
        var file = new FileEntity
        {
            GroupId = group.Id, Name = name ?? ("uf" + Guid.NewGuid().ToString("N")[..6]),
            SheetName = "S",
        };
        db.Files.Add(file);
        await db.SaveChangesAsync();
        return (group.Id, file.Id);
    }

    private static CreateUserRequest Req(string username = "newuser", string password = "secret12",
        string? display = null, bool active = true,
        IReadOnlyList<PermissionAssignmentDto>? permissions = null) =>
        new(username, password, display, active, permissions ?? []);

    [Theory]
    [InlineData("ab", "secret12", "اسم المستخدم قصير جدًا.")]
    [InlineData("  ", "secret12", "اسم المستخدم قصير جدًا.")]
    [InlineData("toolong-username-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "secret12", "اسم المستخدم طويل جدًا.")]
    [InlineData("validname", "short", "كلمة المرور قصيرة جدًا.")]
    public async Task Create_InvalidFields_Rejects400(string username, string password, string message)
    {
        var (_, svc) = Setup();
        var ex = await Assert.ThrowsAsync<InvalidDataException>(() => svc.CreateAsync(Req(username, password), "admin"));
        Assert.Equal(message, ex.Message);
    }

    [Fact]
    public async Task Create_LongDisplay_Rejects400()
    {
        var (_, svc) = Setup();
        var ex = await Assert.ThrowsAsync<InvalidDataException>(
            () => svc.CreateAsync(Req(display: new string('ع', 121)), "admin"));
        Assert.Equal("الاسم المعروض طويل جدًا.", ex.Message);
    }

    [Fact]
    public async Task Create_GlobalPermissionWithScope_Rejects400()
    {
        var (_, svc) = Setup();
        var ex = await Assert.ThrowsAsync<InvalidDataException>(() => svc.CreateAsync(
            Req(permissions: [new PermissionAssignmentDto("users.view", Guid.NewGuid(), null)]), "admin"));
        Assert.Equal("هذه الصلاحية عامة ولا تقبل نطاقًا.", ex.Message);
    }

    [Fact]
    public async Task Create_ScopedWithoutTarget_Rejects400()
    {
        var (_, svc) = Setup();
        var ex = await Assert.ThrowsAsync<InvalidDataException>(() => svc.CreateAsync(
            Req(permissions: [new PermissionAssignmentDto("groups.viewScoped", null, null)]), "admin"));
        Assert.Equal("حدد مجموعة أو ملفًا (وليس كليهما).", ex.Message);
    }

    [Fact]
    public async Task Create_UnknownPermission_Rejects400()
    {
        var (_, svc) = Setup();
        var ex = await Assert.ThrowsAsync<InvalidDataException>(() => svc.CreateAsync(
            Req(permissions: [new PermissionAssignmentDto("no.such", null, null)]), "admin"));
        Assert.Equal("صلاحية غير معروفة.", ex.Message);
    }

    [Fact]
    public async Task Create_BothGroupAndFile_Rejects400()
    {
        var (db, svc) = Setup();
        var (gid, fid) = await SeedFile(db);
        var ex = await Assert.ThrowsAsync<InvalidDataException>(() => svc.CreateAsync(
            Req(permissions: [new PermissionAssignmentDto("groups.viewScoped", gid, fid)]), "admin"));
        Assert.Equal("حدد مجموعة أو ملفًا (وليس كليهما).", ex.Message);
    }

    [Fact]
    public async Task Create_DanglingTargets_Rejects422()
    {
        var (_, svc) = Setup();
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => svc.CreateAsync(
            Req(permissions: [new PermissionAssignmentDto("groups.viewScoped", Guid.NewGuid(), null)]), "admin"));
        Assert.Equal("إحدى المجموعات المحددة غير موجودة.", ex.Message);
    }

    [Fact]
    public async Task Create_DuplicateUsername_Rejects409()
    {
        var (_, svc) = Setup();
        await svc.CreateAsync(Req("dupe"), "admin");
        var ex = await Assert.ThrowsAsync<ConflictException>(() => svc.CreateAsync(Req("dupe"), "admin"));
        Assert.Equal("يوجد مستخدم بهذا الاسم مسبقًا.", ex.Message);
    }

    [Fact]
    public async Task Create_GlobalView_PersistedAlongsideFileSnapshot()
    {
        var (db, svc) = Setup();
        var (_, fileA) = await SeedFile(db);
        var created = await svc.CreateAsync(
            Req("scoped", permissions: [new PermissionAssignmentDto("groups.view", null, null)]), "admin");
        // Explicit view-all grant persists (covers future files too)...
        Assert.Contains(created.Permissions, p => p.Permission == "groups.view" && p.GroupId is null && p.FileId is null);
        // ...alongside explicit file grants snapshotted for current files.
        Assert.Contains(created.Permissions, p => p.Permission == "groups.viewScoped" && p.FileId == fileA);
        // A file added AFTER the save is covered by the persisted global grant.
        var (_, fileB) = await SeedFile(db);
        var reloaded = await svc.GetAsync(created.Id);
        Assert.Contains(reloaded!.Permissions, p => p.Permission == "groups.view" && p.GroupId is null && p.FileId is null);
        _ = fileB;
    }

    [Fact]
    public async Task Create_GroupSelection_SnapshotsGroupFiles()
    {
        var (db, svc) = Setup();
        var (gid, fileA) = await SeedFile(db);
        var created = await svc.CreateAsync(
            Req("gsel", permissions: [new PermissionAssignmentDto("groups.viewScoped", gid, null)]), "admin");
        Assert.DoesNotContain(created.Permissions, p => p.GroupId == gid);
        Assert.Contains(created.Permissions, p => p.FileId == fileA);
    }

    [Fact]
    public async Task Update_PresenceSemantics_PasswordPreservedWhenAbsent()
    {
        var (db, svc) = Setup();
        var created = await svc.CreateAsync(Req("edit1", "secret12", "عرض"), "admin");
        var before = await db.Users.FindAsync(created.Id);
        var beforeHash = before!.PasswordHash;
        // Absent display/password/active leave the row untouched.
        var untouched = await svc.UpdateAsync(created.Id,
            new UpdateUserRequest(null, false, null, null), "admin");
        Assert.Equal("عرض", untouched.DisplayName);
        Assert.True(untouched.IsActive);
        Assert.Equal(beforeHash, (await db.Users.FindAsync(created.Id))!.PasswordHash);
        // Explicit null display clears it; new password rehashes.
        var cleared = await svc.UpdateAsync(created.Id,
            new UpdateUserRequest(null, true, false, "newsecret99"), "admin");
        Assert.Null(cleared.DisplayName);
        Assert.False(cleared.IsActive);
        Assert.NotEqual(beforeHash, (await db.Users.FindAsync(created.Id))!.PasswordHash);
    }

    [Fact]
    public async Task Update_MissingUser_Rejects404()
    {
        var (_, svc) = Setup();
        var ex = await Assert.ThrowsAsync<KeyNotFoundException>(() => svc.UpdateAsync(
            Guid.NewGuid(), new UpdateUserRequest(null, false, null, null), "admin"));
        Assert.Equal("غير موجود.", ex.Message);
    }

    [Fact]
    public async Task ReplacePermissions_SnapshotsAndValidates()
    {
        var (db, svc) = Setup();
        var (gid, _) = await SeedFile(db);
        var created = await svc.CreateAsync(Req("perms1"), "admin");
        var replaced = await svc.ReplacePermissionsAsync(created.Id,
            new ReplacePermissionsRequest([new PermissionAssignmentDto("groups.viewScoped", gid, null)]), "admin");
        Assert.All(replaced.Permissions, p => Assert.Null(p.GroupId));
        Assert.NotEmpty(replaced.Permissions);
        var bad = await Assert.ThrowsAsync<InvalidDataException>(() => svc.ReplacePermissionsAsync(created.Id,
            new ReplacePermissionsRequest([new PermissionAssignmentDto("bogus", null, null)]), "admin"));
        Assert.Equal("صلاحية غير معروفة.", bad.Message);
    }

    [Fact]
    public async Task Dto_NeverLeaksPasswordHash()
    {
        var (_, svc) = Setup();
        var created = await svc.CreateAsync(Req("plainuser"), "admin");
        var text = System.Text.Json.JsonSerializer.Serialize(created);
        Assert.DoesNotContain("PasswordHash", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("hash", text, StringComparison.OrdinalIgnoreCase);
    }
}
