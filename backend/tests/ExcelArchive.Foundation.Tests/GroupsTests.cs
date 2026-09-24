using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Services;
using ExcelArchive.Application.DTOs.ActivityDto;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.GroupDto;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;
using FileEntity = ExcelArchive.Domain.Entities.File;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P2.1 group management + scoped reads. Mirrors V1 lib/actions/groups.ts
/// validation/messages and the groups + group-detail page queries.</summary>
public sealed class GroupsTests
{
    private sealed class StubActivity : IActivityService
    {
        public readonly List<(ActivityAction Action, string Target, object? Details)> Writes = [];
        public Task<ActivityResult> ListAsync(ActivityFilterRequest request, CancellationToken ct = default)
            => throw new NotImplementedException();
        public Task WriteAsync(ActivityAction action, string targetName, object? details = null, CancellationToken ct = default)
        {
            Writes.Add((action, targetName, details));
            return Task.CompletedTask;
        }
    }

    private static (AppDbContext Db, GroupService Groups, StubActivity Activity) Fresh()
    {
        var db = TestHelpers.InMemoryDb();
        var activity = new StubActivity();
        return (db, new GroupService(TestHelpers.Uow(db), activity, TestHelpers.Auth(db)), activity);
    }

    private static Group SeedGroup(AppDbContext db, string name, int sort = 0)
    {
        var g = new Group { Name = name, Description = "", SortOrder = sort };
        db.Groups.Add(g);
        db.SaveChanges();
        return g;
    }

    private static FileEntity SeedFile(AppDbContext db, Guid groupId, string name, int rows, int cols = 2)
    {
        var f = new FileEntity
        {
            GroupId = groupId, Name = name, Description = "", OriginalFilename = name + ".xlsx",
            SheetName = "S1", RowCount = rows, ColumnSignature = "sig", Version = 1,
            UploadedAt = DateTime.UtcNow.AddMinutes(-rows),
        };
        db.Files.Add(f);
        for (var i = 0; i < cols; i++)
            db.FileColumns.Add(new FileColumn
            {
                FileId = f.Id, HeaderRaw = "h" + i, HeaderNormalized = "h" + i, ColumnIndex = i,
            });
        db.SaveChanges();
        return f;
    }

    private static DataScopeDto Global() => new() { GroupIds = null, FileIds = null };

    [Theory]
    [InlineData("a", "", "اسم المجموعة قصير جدًا.")]
    [InlineData("", "", "اسم المجموعة قصير جدًا.")]
    public async Task Create_RejectsShortName(string name, string desc, string message)
    {
        var (db, groups, _) = Fresh();
        using (db)
        {
            var ex = await Assert.ThrowsAsync<InvalidDataException>(() => groups.CreateAsync(new CreateGroupRequest(name, desc), "admin"));
            Assert.Equal(message, ex.Message);
        }
    }

    [Fact]
    public async Task Create_RejectsLongNameAndDescription()
    {
        var (db, groups, _) = Fresh();
        using (db)
        {
            var ex = await Assert.ThrowsAsync<InvalidDataException>(
                () => groups.CreateAsync(new CreateGroupRequest(new string('n', 121)), "admin"));
            Assert.Equal("اسم المجموعة طويل جدًا.", ex.Message);
            ex = await Assert.ThrowsAsync<InvalidDataException>(
                () => groups.CreateAsync(new CreateGroupRequest("ok-name", new string('d', 501)), "admin"));
            Assert.Equal("الوصف طويل جدًا.", ex.Message);
        }
    }

    [Fact]
    public async Task Create_Trims_OrdersLast_WritesActivity()
    {
        var (db, groups, activity) = Fresh();
        using (db)
        {
            SeedGroup(db, "g1", 0);
            var created = await groups.CreateAsync(new CreateGroupRequest("  g2  ", "  d  "), "admin");
            Assert.Equal("g2", created.Name);
            Assert.Equal("d", created.Description);
            Assert.Equal(1, created.SortOrder);
            var write = Assert.Single(activity.Writes);
            Assert.Equal(ActivityAction.GroupCreated, write.Action);
            var dup = await Assert.ThrowsAsync<InvalidOperationException>(
                () => groups.CreateAsync(new CreateGroupRequest("g2"), "admin"));
            Assert.Equal("يوجد اسم مجموعة مطابق بالفعل.", dup.Message);
        }
    }

    [Fact]
    public async Task Create_DefaultSearchFlag_RoundTrips()
    {
        var (db, groups, _) = Fresh();
        using (db)
        {
            var included = await groups.CreateAsync(new CreateGroupRequest("gd-1"), "admin");
            Assert.True(included.IncludeInDefaultSearch);
            var excluded = await groups.CreateAsync(new CreateGroupRequest("gd-2", "", false), "admin");
            Assert.False(excluded.IncludeInDefaultSearch);
            var listed = await groups.ListAsync(Global());
            Assert.True(listed.Single(g => g.Id == included.Id).IncludeInDefaultSearch);
            Assert.False(listed.Single(g => g.Id == excluded.Id).IncludeInDefaultSearch);
        }
    }

    [Fact]
    public async Task Update_DefaultSearchFlag_AppliesOnlyWhenProvided()
    {
        var (db, groups, _) = Fresh();
        using (db)
        {
            var g = SeedGroup(db, "gu-1");
            Assert.True((await groups.GetAsync(g.Id, Global()))!.IncludeInDefaultSearch);
            var updated = await groups.UpdateAsync(g.Id, new UpdateGroupRequest("gu-1", "", false), "admin");
            Assert.False(updated.IncludeInDefaultSearch);
            // Omitted flag keeps the current value.
            var kept = await groups.UpdateAsync(g.Id, new UpdateGroupRequest("gu-1-renamed"), "admin");
            Assert.Equal("gu-1-renamed", kept.Name);
            Assert.False(kept.IncludeInDefaultSearch);
            var restored = await groups.UpdateAsync(g.Id, new UpdateGroupRequest("gu-1-renamed", "", true), "admin");
            Assert.True(restored.IncludeInDefaultSearch);
        }
    }

    [Fact]
    public async Task Update_Missing_Duplicate_Success()
    {
        var (db, groups, activity) = Fresh();
        using (db)
        {
            var g1 = SeedGroup(db, "g1");
            SeedGroup(db, "g2");
            var missing = await Assert.ThrowsAsync<KeyNotFoundException>(
                () => groups.UpdateAsync(Guid.NewGuid(), new UpdateGroupRequest("x-name"), "admin"));
            Assert.Equal("المجموعة غير موجودة.", missing.Message);
            var dup = await Assert.ThrowsAsync<InvalidOperationException>(
                () => groups.UpdateAsync(g1.Id, new UpdateGroupRequest("g2"), "admin"));
            Assert.Equal("يوجد اسم مجموعة مطابق بالفعل.", dup.Message);
            var updated = await groups.UpdateAsync(g1.Id, new UpdateGroupRequest("  g1-new  ", "dd"), "admin");
            Assert.Equal("g1-new", updated.Name);
            Assert.Contains(activity.Writes, w => w.Action == ActivityAction.GroupUpdated);
        }
    }

    [Fact]
    public async Task Reorder_Boundaries_Swap_Activity()
    {
        var (db, groups, activity) = Fresh();
        using (db)
        {
            var g1 = SeedGroup(db, "g1", 0);
            var g2 = SeedGroup(db, "g2", 1);
            var unknown = await Assert.ThrowsAsync<InvalidOperationException>(
                () => groups.ReorderAsync(Guid.NewGuid(), "up", "admin"));
            Assert.Equal("لا يمكن نقل المجموعة في هذا الاتجاه.", unknown.Message);
            var top = await Assert.ThrowsAsync<InvalidOperationException>(
                () => groups.ReorderAsync(g1.Id, "up", "admin"));
            Assert.Equal("لا يمكن نقل المجموعة في هذا الاتجاه.", top.Message);
            var bottom = await Assert.ThrowsAsync<InvalidOperationException>(
                () => groups.ReorderAsync(g2.Id, "down", "admin"));
            Assert.Equal("لا يمكن نقل المجموعة في هذا الاتجاه.", bottom.Message);
            await groups.ReorderAsync(g2.Id, "up", "admin");
            var order = await db.Groups.OrderBy(g => g.SortOrder).Select(g => g.Name).ToListAsync();
            Assert.Equal(["g2", "g1"], order);
            Assert.Contains(activity.Writes, w => w.Action == ActivityAction.GroupReordered);
        }
    }

    [Fact]
    public async Task Delete_Missing_Mismatch_CascadesWithCounts()
    {
        var (db, groups, activity) = Fresh();
        using (db)
        {
            var g = SeedGroup(db, "gone");
            SeedFile(db, g.Id, "f1", rows: 7);
            var missing = await Assert.ThrowsAsync<KeyNotFoundException>(
                () => groups.DeleteAsync(Guid.NewGuid(), "gone", "admin"));
            Assert.Equal("المجموعة غير موجودة.", missing.Message);
            var mismatch = await Assert.ThrowsAsync<InvalidOperationException>(
                () => groups.DeleteAsync(g.Id, "wrong", "admin"));
            Assert.Equal("اسم التأكيد لا يطابق اسم المجموعة.", mismatch.Message);
            await groups.DeleteAsync(g.Id, "gone", "admin");
            Assert.Empty(await db.Groups.ToListAsync());
            Assert.Empty(await db.Files.ToListAsync());
            var write = Assert.Single(activity.Writes, w => w.Action == ActivityAction.GroupDeleted);
            Assert.Equal("gone", write.Target);
        }
    }

    [Fact]
    public async Task List_IsScoped_WithCounts()
    {
        using var db = TestHelpers.InMemoryDb();
        using (db)
        {
            var auth = TestHelpers.Auth(db);
            var groups = new GroupService(TestHelpers.Uow(db), new StubActivity(), auth);
            var g1 = SeedGroup(db, "g1");
            var g2 = SeedGroup(db, "g2");
            var f1 = SeedFile(db, g1.Id, "f1", rows: 4);
            SeedFile(db, g1.Id, "f2", rows: 6);
            var f3 = SeedFile(db, g2.Id, "f3", rows: 10);

            var all = await groups.ListAsync(Global());
            Assert.Equal(2, all.Count);
            Assert.Equal((2, 10L), (all.Single(g => g.Id == g1.Id).FileCount, all.Single(g => g.Id == g1.Id).RecordCount));

            var scoped = await groups.ListAsync(new DataScopeDto { GroupIds = [g1.Id], FileIds = [f1.Id, f3.Id] });
            Assert.Equal([g1.Id], scoped.Select(g => g.Id));

            var fileOnly = await groups.ListAsync(new DataScopeDto { GroupIds = [g2.Id], FileIds = [f3.Id] });
            var only = Assert.Single(fileOnly);
            Assert.Equal(g2.Id, only.Id);
            Assert.Equal(1, only.FileCount);
            Assert.Equal(10L, only.RecordCount);

            var empty = await groups.ListAsync(new DataScopeDto { GroupIds = [], FileIds = [] });
            Assert.Empty(empty);
        }
    }

    [Fact]
    public async Task Create_Private_BindsOwner_ExcludesFromDefaultSearch()
    {
        var (db, groups, activity) = Fresh();
        using (db)
        {
            db.Users.Add(new User { Username = "owner1", PasswordHash = "x", DisplayName = "o" });
            await db.SaveChangesAsync();
            var created = await groups.CreateAsync(
                new CreateGroupRequest("priv-1", "secret", true, true), "owner1");
            Assert.True(created.IsPrivate);
            Assert.False(created.IncludeInDefaultSearch);
            Assert.Equal("owner1", created.OwnerUsername);
            Assert.NotNull(created.OwnerUserId);
            var row = await db.Groups.SingleAsync(g => g.Id == created.Id);
            Assert.True(row.IsPrivate);
            Assert.Equal("owner1", row.OwnerUsername);
            Assert.Contains(activity.Writes, w => w.Action == ActivityAction.GroupCreated);
        }
    }

    [Fact]
    public async Task Create_Private_UnknownActor_Throws()
    {
        var (db, groups, _) = Fresh();
        using (db)
        {
            var ex = await Assert.ThrowsAsync<InvalidOperationException>(
                () => groups.CreateAsync(new CreateGroupRequest("priv-x", "", true, true), "ghost"));
            Assert.Equal("تعذر تحديد مالك المجموعة الخاصة.", ex.Message);
        }
    }

    [Fact]
    public async Task Scope_Private_HiddenFromGlobalViewer_VisibleToOwnerAndMaintainer()
    {
        using var db = TestHelpers.InMemoryDb();
        using (db)
        {
            var owner = new User { Username = "owner1", PasswordHash = "x" };
            db.Users.Add(owner);
            var shared = new Group { Name = "shared" };
            var priv = new Group { Name = "priv", IsPrivate = true, OwnerUserId = owner.Id, OwnerUsername = "owner1" };
            db.Groups.AddRange(shared, priv);
            await db.SaveChangesAsync();
            // Owner id is database-generated: reload for the scope checks below.
            owner = await db.Users.SingleAsync(u => u.Username == "owner1");
            priv.OwnerUserId = owner.Id;
            await db.SaveChangesAsync();
            var privFile = SeedFile(db, priv.Id, "pf", rows: 3);
            var sharedFile = SeedFile(db, shared.Id, "sf", rows: 5);
            var auth = TestHelpers.Auth(db);

            // Global viewer without the maintenance grant: explicit scope
            // without the foreign private group or its files.
            var viewer = new CurrentUserDto(Guid.NewGuid(), "viewer", null,
                [TestHelpers.Perm(Permissions.GroupsView)]);
            var viewerScope = await auth.ResolveDataScope(viewer);
            Assert.NotNull(viewerScope.GroupIds);
            Assert.Contains(shared.Id, viewerScope.GroupIds!);
            Assert.DoesNotContain(priv.Id, viewerScope.GroupIds!);
            Assert.Contains(sharedFile.Id, viewerScope.FileIds!);
            Assert.DoesNotContain(privFile.Id, viewerScope.FileIds!);
            Assert.Null(await groupsScoped(db).GetAsync(priv.Id, viewerScope));

            // Owner with no grants at all still keeps their own group.
            var ownerUser = new CurrentUserDto(owner.Id, "owner1", null, []);
            var ownerScope = await auth.ResolveDataScope(ownerUser);
            Assert.Contains(priv.Id, ownerScope.GroupIds!);
            Assert.Contains(privFile.Id, ownerScope.FileIds!);

            // Maintenance grant restores the legacy unrestricted scope.
            var maintainer = new CurrentUserDto(Guid.NewGuid(), "maint", null,
                [TestHelpers.Perm(Permissions.GroupsView), TestHelpers.Perm(Permissions.GroupsViewPrivate)]);
            var maintScope = await auth.ResolveDataScope(maintainer);
            Assert.Null(maintScope.GroupIds);
            Assert.Null(maintScope.FileIds);
        }

        static GroupService groupsScoped(AppDbContext ctx)
            => new(TestHelpers.Uow(ctx), new StubActivity(), TestHelpers.Auth(ctx));
    }

    [Fact]
    public async Task Activity_PrivateRows_HiddenFromStrangers()
    {
        using var db = TestHelpers.InMemoryDb();
        using (db)
        {
            var owner = new User { Username = "owner1", PasswordHash = "x" };
            var stranger = new User { Username = "stranger", PasswordHash = "x" };
            db.Users.AddRange(owner, stranger);
            var priv = new Group { Name = "priv-act", IsPrivate = true, OwnerUsername = "owner1" };
            db.Groups.Add(priv);
            await db.SaveChangesAsync();
            owner = await db.Users.SingleAsync(u => u.Username == "owner1");
            stranger = await db.Users.SingleAsync(u => u.Username == "stranger");
            priv.OwnerUserId = owner.Id;
            await db.SaveChangesAsync();
            var file = SeedFile(db, priv.Id, "paf", rows: 2);

            var uow = TestHelpers.Uow(db);
            var activity = new ActivityService(uow);
            await activity.WriteAsync(ActivityAction.FileUploaded, file.Name,
                new { fileId = file.Id, rows = 2 });
            await activity.WriteAsync(ActivityAction.GroupCreated, priv.Name,
                new { by = "owner1", isPrivate = true });
            await activity.WriteAsync(ActivityAction.UserCreated, "someone", new { by = "owner1" });

            // Stranger: private file + group rows dropped, unrelated rows stay.
            var hidden = await activity.ListAsync(new ActivityFilterRequest(1, 50, null, null,
                new ActivityVisibility(stranger.Id, false)));
            Assert.DoesNotContain(hidden.Items, i => i.TargetName == file.Name);
            Assert.DoesNotContain(hidden.Items, i => i.TargetName == priv.Name);
            Assert.Contains(hidden.Items, i => i.TargetName == "someone");

            // Owner and maintenance keep the full history.
            var own = await activity.ListAsync(new ActivityFilterRequest(1, 50, null, null,
                new ActivityVisibility(owner.Id, false)));
            Assert.Equal(3, own.Items.Count);
            var maint = await activity.ListAsync(new ActivityFilterRequest(1, 50, null, null,
                new ActivityVisibility(Guid.NewGuid(), true)));
            Assert.Equal(3, maint.Items.Count);
        }
    }

    [Fact]
    public async Task GetDetail_Unknown_Invisible_VisibleWithEdits()
    {
        using var db = TestHelpers.InMemoryDb();
        using (db)
        {
            var auth = TestHelpers.Auth(db);
            var groups = new GroupService(TestHelpers.Uow(db), new StubActivity(), auth);
            var g1 = SeedGroup(db, "g1");
            var f1 = SeedFile(db, g1.Id, "f1", rows: 4, cols: 3);
            db.RecordEdits.Add(new RecordEdit
            {
                RecordId = Guid.NewGuid(), FileId = f1.Id, HeaderRaw = "h0",
                OldValue = "a", NewValue = "b",
            });
            db.SaveChanges();

            var user = TestHelpers.User(
                TestHelpers.Perm("groups.viewScoped", groupId: g1.Id),
                TestHelpers.Perm("edits.badge"));
            Assert.Null(await groups.GetDetailAsync(Guid.NewGuid(), user));
            var other = TestHelpers.User(TestHelpers.Perm("groups.viewScoped", groupId: Guid.NewGuid()));
            Assert.Null(await groups.GetDetailAsync(g1.Id, other));

            var detail = await groups.GetDetailAsync(g1.Id, user);
            Assert.NotNull(detail);
            Assert.Equal("g1", detail.Group.Name);
            var file = Assert.Single(detail.Files);
            Assert.Equal(3, file.ColumnCount);
            Assert.True(file.HasEdits);

            var noBadge = TestHelpers.User(TestHelpers.Perm("groups.viewScoped", groupId: g1.Id));
            var plain = await groups.GetDetailAsync(g1.Id, noBadge);
            Assert.False(Assert.Single(plain!.Files).HasEdits);
        }
    }
}
