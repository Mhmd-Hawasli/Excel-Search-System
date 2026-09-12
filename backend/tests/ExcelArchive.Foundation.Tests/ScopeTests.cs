using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using FileEntity = ExcelArchive.Domain.Entities.File;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P1.3 data-scope tests with an InMemory store. Mirrors the V1
/// session-user.test.ts scope matrix (docs/07.2).</summary>
public sealed class ScopeTests
{
    private static readonly Guid G1 = Guid.NewGuid();
    private static readonly Guid G2 = Guid.NewGuid();
    private static readonly Guid F1 = Guid.NewGuid();
    private static readonly Guid F2 = Guid.NewGuid();
    private static readonly Guid F3 = Guid.NewGuid();

    private static AppDbContext Seeded()
    {
        var db = TestHelpers.InMemoryDb();
        db.Groups.AddRange(
            new Group { Id = G1, Name = "g1" },
            new Group { Id = G2, Name = "g2" });
        db.Files.AddRange(
            new FileEntity { Id = F1, GroupId = G1, Name = "f1" },
            new FileEntity { Id = F2, GroupId = G1, Name = "f2" },
            new FileEntity { Id = F3, GroupId = G2, Name = "f3" });
        db.SaveChanges();
        return db;
    }

    private static CurrentUserDto User(params PermissionDto[] perms) => TestHelpers.User(perms);

    [Fact]
    public async Task GlobalView_SeesEverything()
    {
        using var db = Seeded();
        var scope = await TestHelpers.Auth(db).ResolveDataScope(User(TestHelpers.Perm(Permissions.GroupsView)));
        Assert.Null(scope.GroupIds);
        Assert.Null(scope.FileIds);
    }

    [Fact]
    public async Task GroupGrant_ExpandsToItsFiles()
    {
        using var db = Seeded();
        var scope = await TestHelpers.Auth(db)
            .ResolveDataScope(User(TestHelpers.Perm(Permissions.GroupsViewScoped, groupId: G1)));
        Assert.Equal([G1], scope.GroupIds);
        Assert.True(new HashSet<Guid> { F1, F2 }.SetEquals(scope.FileIds!));
    }

    [Theory]
    [InlineData("groups.viewScoped")]
    [InlineData("files.viewScoped")]
    public async Task SingleFileGrant_StaysIsolatedFromSiblings(string key)
    {
        using var db = Seeded();
        var scope = await TestHelpers.Auth(db)
            .ResolveDataScope(User(TestHelpers.Perm(key, fileId: F1)));
        Assert.Equal([F1], scope.FileIds);
        Assert.Equal([G1], scope.GroupIds);
        Assert.DoesNotContain(F2, scope.FileIds!);
    }

    [Fact]
    public async Task GroupPlusFile_CombinesWithoutLeak()
    {
        using var db = Seeded();
        var scope = await TestHelpers.Auth(db).ResolveDataScope(User(
            TestHelpers.Perm(Permissions.GroupsViewScoped, groupId: G2),
            TestHelpers.Perm(Permissions.GroupsViewScoped, fileId: F1)));
        Assert.True(new HashSet<Guid> { G1, G2 }.SetEquals(scope.GroupIds!));
        Assert.True(new HashSet<Guid> { F1, F3 }.SetEquals(scope.FileIds!));
        Assert.DoesNotContain(F2, scope.FileIds!);
    }

    [Fact]
    public async Task NoGrants_SeesNothing_NotEverything()
    {
        using var db = Seeded();
        var scope = await TestHelpers.Auth(db).ResolveDataScope(User());
        Assert.NotNull(scope.GroupIds);
        Assert.NotNull(scope.FileIds);
        Assert.Empty(scope.GroupIds!);
        Assert.Empty(scope.FileIds!);
    }
}
