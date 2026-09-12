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
