using ExcelArchive.Api.Controllers;
using ExcelArchive.Application.DTOs.SearchDto;
using ExcelArchive.Application.Services;
using ExcelArchive.Api.Common.Http;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P3.1 search parameter validation + auth branches (no database).</summary>
public sealed class SearchValidationTests
{
    private sealed class StubSearch : ISearchService
    {
        public bool Called;
        public Task<SearchResultSet> SearchAsync(SearchQuery query, CancellationToken ct = default)
        {
            Called = true;
            return Task.FromResult(new SearchResultSet([], 0, query.Page, query.PageSize, 0));
        }
    }

    private static (AppDbContext Db, AuthService Auth, StubSearch Search) Fresh()
    {
        var db = TestHelpers.InMemoryDb();
        var auth = TestHelpers.Auth(db);
        return (db, auth, new StubSearch());
    }

    private static async Task<User> SeedAdmin(AppDbContext db, AuthService auth)
    {
        var user = new User { Username = "admin", PasswordHash = auth.HashPassword("pw"), IsActive = true };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        foreach (var key in Permissions.OwnerGlobals)
            db.UserPermissions.Add(new UserPermission { UserId = user.Id, Permission = key });
        await db.SaveChangesAsync();
        return user;
    }

    private static SearchController Controller(AppDbContext db, AuthService auth, StubSearch search, DefaultHttpContext http)
        => new(search, auth) { ControllerContext = new ControllerContext { HttpContext = http } };

    private static DefaultHttpContext Authed(AuthService auth, User user)
    {
        var http = new DefaultHttpContext();
        http.Request.Headers.Cookie = $"{SessionCookie.Name}={auth.CreateSessionToken(user)}";
        return http;
    }

    private static async Task<(int Status, StubSearch Search)> Get(
        AppDbContext db, AuthService auth, StubSearch search, DefaultHttpContext http,
        string? q = "احمد", string? mode = "full", string? field = null,
        string[]? groupIds = null, string[]? fileIds = null,
        string? page = null, string? pageSize = null, string? sortBy = null, string? sortDirection = "asc")
    {
        var result = await Controller(db, auth, search, http).Search(
            q, mode, field, groupIds, fileIds, page, pageSize, sortBy, sortDirection);
        return result switch
        {
            ObjectResult o => (o.StatusCode ?? 200, search),
            StatusCodeResult s => (s.StatusCode, search),
            _ => (200, search),
        };
    }

    [Fact]
    public async Task Anonymous_Is401()
    {
        var (db, auth, search) = Fresh();
        using (db)
        {
            var (status, _) = await Get(db, auth, search, new DefaultHttpContext());
            Assert.Equal(401, status);
        }
    }

    [Fact]
    public async Task UserWithoutSearchView_IsHidden404()
    {
        var (db, auth, search) = Fresh();
        using (db)
        {
            var user = new User { Username = "u", PasswordHash = "x", IsActive = true };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            var (status, stub) = await Get(db, auth, search, Authed(auth, user));
            Assert.Equal(404, status);
            Assert.False(stub.Called);
        }
    }

    public static IEnumerable<object?[]> BadCases()
    {
        yield return [new string('a', 201), "full", null, null, null, null, null, null, "asc"];
        yield return ["x", "sometimes", null, null, null, null, null, null, "asc"];
        yield return ["x", "custom", null, null, null, null, null, null, "asc"];
        yield return ["x", "custom", "nope", null, null, null, null, null, "asc"];
        yield return ["x", "full", null, new[] { "not-a-uuid" }, null, null, null, null, "asc"];
        yield return ["x", "full", null, null, new[] { "zzzz" }, null, null, null, "asc"];
        yield return ["x", "full", null, null, null, "0", null, null, "asc"];
        yield return ["x", "full", null, null, null, "abc", null, null, "asc"];
        yield return ["x", "full", null, null, null, null, "9", null, "asc"];
        yield return ["x", "full", null, null, null, null, "101", null, "asc"];
        yield return ["x", "full", null, null, null, null, null, "nope", "asc"];
        yield return ["x", "full", null, null, null, null, null, null, "sideways"];
    }

    [Theory]
    [MemberData(nameof(BadCases))]
    public async Task InvalidParameters_Are400(
        string? q, string? mode, string? field, string[]? groupIds, string[]? fileIds,
        string? page, string? pageSize, string? sortBy, string? sortDirection)
    {
        var (db, auth, search) = Fresh();
        using (db)
        {
            var admin = await SeedAdmin(db, auth);
            var (status, stub) = await Get(db, auth, search, Authed(auth, admin),
                q, mode, field, groupIds, fileIds, page, pageSize, sortBy, sortDirection);
            Assert.Equal(400, status);
            Assert.False(stub.Called);
        }
    }

    [Fact]
    public async Task CustomWithoutField_SaysChooseField()
    {
        var (db, auth, search) = Fresh();
        using (db)
        {
            var admin = await SeedAdmin(db, auth);
            var result = await Controller(db, auth, search, Authed(auth, admin))
                .Search("x", "custom", null, null, null, null, null, null, "asc");
            var body = Assert.IsType<ObjectResult>(result);
            Assert.Equal(400, body.StatusCode);
            Assert.Contains("اختر حقل البحث المخصص.", body.Value?.ToString() ?? "");
        }
    }

    [Fact]
    public async Task EmptyScope_SelectionOutsideGrants_ReturnsEmptyWithoutService()
    {
        var (db, auth, search) = Fresh();
        using (db)
        {
            var user = new User { Username = "scoped", PasswordHash = "x", IsActive = true };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            var scopedGroup = Guid.NewGuid();
            db.UserPermissions.Add(new UserPermission
            {
                UserId = user.Id, Permission = Permissions.GroupsViewScoped, GroupId = scopedGroup,
            });
            await db.SaveChangesAsync();
            // Requesting an inaccessible group intersects to nothing -> empty result, not 404.
            var result = await Controller(db, auth, search, Authed(auth, user))
                .Search("احمد", "full", null, [Guid.NewGuid().ToString()], null, null, null, null, "asc");
            var ok = Assert.IsType<OkObjectResult>(result);
            Assert.Equal(200, ok.StatusCode);
            Assert.False(search.Called);
        }
    }
}
