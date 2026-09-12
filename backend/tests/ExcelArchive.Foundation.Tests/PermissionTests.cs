using ExcelArchive.Domain.Common;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Services;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P1.3 permission catalog + normalization + check semantics.
/// Mirrors V1 session-user.test.ts expectations (docs/07.2).</summary>
public sealed class PermissionTests
{
    private static readonly string[] ExpectedCanonical =
    [
        "users.view", "users.create", "users.update", "users.delete",
        "backup.view", "backup.export", "backup.restore",
        "activity.view", "activity.browse",
        "merge.view", "sheetMerge.view",
        "export.view", "export.run",
        "edits.view", "edits.badge", "edits.update",
        "upload.view", "upload.run",
        "conflicts.view", "conflicts.filters",
        "categories.view", "categories.manage",
        "groups.view", "groups.viewScoped", "groups.create", "groups.update",
    ];

    [Fact]
    public void CanonicalCatalog_HasExactly26Keys()
    {
        Assert.Equal(26, Permissions.Canonical.Length);
        Assert.Equal(ExpectedCanonical.OrderBy(k => k), Permissions.Canonical.OrderBy(k => k));
        Assert.DoesNotContain(Permissions.GroupsManage, Permissions.Canonical);
        Assert.DoesNotContain(Permissions.SearchView, Permissions.Canonical);
        Assert.Equal(Permissions.Canonical, Permissions.All);
    }

    [Fact]
    public void OwnerGlobals_ExcludeOnlyScopedKey()
    {
        Assert.Equal(25, Permissions.OwnerGlobals.Length);
        Assert.DoesNotContain(Permissions.GroupsViewScoped, Permissions.OwnerGlobals);
        Assert.Contains(Permissions.GroupsView, Permissions.OwnerGlobals);
    }

    [Fact]
    public void Unify_DropsLegacySearchGrants_UpgradesFilesScoped_Dedupes()
    {
        var rows = AuthService.UnifyDataPermissions([
            TestHelpers.Perm("search.view"),
            TestHelpers.Perm("search.scoped", groupId: Guid.NewGuid()),
            TestHelpers.Perm("files.viewScoped", fileId: Guid.NewGuid()),
            TestHelpers.Perm("groups.view"),
            TestHelpers.Perm("groups.view"),
        ]);
        Assert.DoesNotContain(rows, r => r.Permission is "search.view" or "search.scoped");
        Assert.Contains(rows, r => r.Permission == Permissions.GroupsViewScoped);
        Assert.Single(rows, r => r.Permission == Permissions.GroupsView);
    }

    private static bool Has(string key, params ExcelArchive.Application.DTOs.AuthDto.PermissionDto[] perms)
    {
        using var db = TestHelpers.InMemoryDb();
        return TestHelpers.Auth(db).HasPermission(TestHelpers.User(perms), key);
    }

    [Fact]
    public void GlobalView_GrantsSearchView()
    {
        var u = TestHelpers.Perm(Permissions.GroupsView);
        Assert.True(Has(Permissions.SearchView, u));
        Assert.True(Has("search.view", u));
    }

    [Fact]
    public void SingleFileGrant_GrantsSearchView_ButNotGlobalView()
    {
        var scoped = TestHelpers.Perm(Permissions.GroupsViewScoped, fileId: Guid.NewGuid());
        Assert.True(Has(Permissions.SearchView, scoped));
        Assert.False(Has(Permissions.GroupsView, scoped));
    }

    [Fact]
    public void LegacyFilesViewScoped_BehavesLikeGroupsViewScoped()
    {
        var legacy = TestHelpers.Perm("files.viewScoped", fileId: Guid.NewGuid());
        Assert.True(Has(Permissions.SearchView, legacy));
        Assert.False(Has(Permissions.GroupsView, legacy));
    }

    [Fact]
    public void RetiredSearchOnlyGrants_GrantNothing()
    {
        Assert.False(Has(Permissions.SearchView, TestHelpers.Perm("search.view")));
        Assert.False(Has(Permissions.GroupsView, TestHelpers.Perm("search.view")));
        Assert.False(Has(Permissions.SearchView));
    }

    [Fact]
    public void ScopedRows_NeverSatisfyGlobalChecks()
    {
        var scoped = TestHelpers.Perm("users.view", groupId: Guid.NewGuid());
        Assert.False(Has("users.view", scoped));
    }

    [Fact]
    public void GroupsManageAlias_WorksBothDirections()
    {
        Assert.True(Has(Permissions.GroupsView, TestHelpers.Perm(Permissions.GroupsManage)));
        Assert.True(Has(Permissions.GroupsManage, TestHelpers.Perm(Permissions.GroupsView)));
    }

    [Fact]
    public void LegacyGroupsView_ImpliesCreateAndUpdate()
    {
        var view = TestHelpers.Perm(Permissions.GroupsView);
        Assert.True(Has(Permissions.GroupsCreate, view));
        Assert.True(Has(Permissions.GroupsUpdate, view));
        var manage = TestHelpers.Perm(Permissions.GroupsManage);
        Assert.True(Has(Permissions.GroupsCreate, manage));
        Assert.True(Has(Permissions.GroupsUpdate, manage));
    }

    [Fact]
    public void FineGrainedGroupGrants_DoNotImplyEachOther()
    {
        var create = TestHelpers.Perm(Permissions.GroupsCreate);
        Assert.True(Has(Permissions.GroupsCreate, create));
        Assert.False(Has(Permissions.GroupsUpdate, create));
        Assert.False(Has(Permissions.GroupsView, create));
        var update = TestHelpers.Perm(Permissions.GroupsUpdate);
        Assert.True(Has(Permissions.GroupsUpdate, update));
        Assert.False(Has(Permissions.GroupsCreate, update));
        Assert.False(Has(Permissions.GroupsView, update));
    }
}
