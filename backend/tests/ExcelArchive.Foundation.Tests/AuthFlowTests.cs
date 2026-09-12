using ExcelArchive.Api.Controllers;
using ExcelArchive.Application.Services;
using ExcelArchive.Api.Common.Http;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Common;
using ExcelArchive.Application.DTOs.GroupDto;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Foundation.Tests;

/// <summary>
/// P1.3–P1.4 auth flow tests over real controllers with an InMemory store:
/// login/logout/me, wrong/inactive/expired cases, cookie flags, and the
/// 401-vs-hidden-404 branch. No network, no Postgres server.
/// </summary>
public sealed class AuthFlowTests
{
    private sealed class StubGroups : IGroupService
    {
        public Task<IReadOnlyList<GroupDto>> ListAsync(DataScopeDto scope, CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<GroupDto>>([]);
        public Task<GroupDto?> GetAsync(Guid id, DataScopeDto scope, CancellationToken ct = default)
            => Task.FromResult<GroupDto?>(null);
        public Task<GroupDetailDto?> GetDetailAsync(Guid id, CurrentUserDto user, CancellationToken ct = default)
            => Task.FromResult<GroupDetailDto?>(null);
        public Task<GroupDto> CreateAsync(CreateGroupRequest request, string actorUsername, CancellationToken ct = default)
            => throw new NotImplementedException();
        public Task<GroupDto> UpdateAsync(Guid id, UpdateGroupRequest request, string actorUsername, CancellationToken ct = default)
            => throw new NotImplementedException();
        public Task ReorderAsync(Guid id, string direction, string actorUsername, CancellationToken ct = default)
            => throw new NotImplementedException();
        public Task DeleteAsync(Guid id, string confirmName, string actorUsername, CancellationToken ct = default)
            => throw new NotImplementedException();
    }

    private static (AppDbContext Db, AuthService Auth) Fresh()
    {
        var db = TestHelpers.InMemoryDb();
        return (db, TestHelpers.Auth(db));
    }

    private static User SeedUser(AppDbContext db, AuthService auth,
        string username = "alice", string password = "correct-horse",
        bool active = true, IEnumerable<UserPermission>? permissions = null)
    {
        var user = new User
        {
            Username = username,
            PasswordHash = auth.HashPassword(password),
            DisplayName = null,
            IsActive = active,
        };
        foreach (var p in permissions ?? [])
        {
            p.UserId = user.Id;
            p.User = user;
            user.Permissions.Add(p);
        }
        db.Users.Add(user);
        db.SaveChanges();
        return user;
    }

    private static AuthController Controller(AuthService auth, DefaultHttpContext http)
    {
        var controller = new AuthController(auth)
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };
        return controller;
    }

    private static string? TokenOf(DefaultHttpContext http)
    {
        var cookie = http.Request.Headers.Cookie.ToString();
        var prefix = SessionCookie.Name + "=";
        return cookie.StartsWith(prefix) ? cookie[prefix.Length..] : null;
    }

    private static void WithCookie(DefaultHttpContext http, string token)
        => http.Request.Headers.Cookie = $"{SessionCookie.Name}={token}";

    private static string SetCookies(DefaultHttpContext http)
        => http.Response.Headers["Set-Cookie"].ToString();

    [Fact]
    public async Task Login_Success_SetsSessionCookie()
    {
        var (db, auth) = Fresh();
        using (db)
        {
            SeedUser(db, auth);
            var http = new DefaultHttpContext();
            var result = await Controller(auth, http)
                .Login(new LoginRequest("alice", "correct-horse"));
            var ok = Assert.IsType<OkObjectResult>(result);
            Assert.Equal(200, ok.StatusCode);
            var cookies = SetCookies(http);
            Assert.Contains($"{SessionCookie.Name}=", cookies);
            Assert.Contains("httponly", cookies, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("samesite=lax", cookies, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("path=/", cookies, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("max-age=43200", cookies, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task Login_TrimsUsername_PreservesPasswordWhitespace()
    {
        var (db, auth) = Fresh();
        using (db)
        {
            SeedUser(db, auth, username: "bob", password: "  spaced  ");
            Assert.IsType<OkObjectResult>(await Controller(auth, new DefaultHttpContext())
                .Login(new LoginRequest("  bob  ", "  spaced  ")));
            Assert.IsType<UnauthorizedObjectResult>(await Controller(auth, new DefaultHttpContext())
                .Login(new LoginRequest("bob", "spaced")));
        }
    }

    [Fact]
    public async Task Login_RejectsBlank_Wrong_Inactive()
    {
        var (db, auth) = Fresh();
        using (db)
        {
            SeedUser(db, auth);
            SeedUser(db, auth, username: "zed", password: "irrelevant", active: false);
            Assert.IsType<ObjectResult>(await Controller(auth, new DefaultHttpContext())
                .Login(new LoginRequest("", "")));
            Assert.IsType<UnauthorizedObjectResult>(await Controller(auth, new DefaultHttpContext())
                .Login(new LoginRequest("alice", "wrong")));
            Assert.IsType<UnauthorizedObjectResult>(await Controller(auth, new DefaultHttpContext())
                .Login(new LoginRequest("nobody", "whatever")));
            Assert.IsType<UnauthorizedObjectResult>(await Controller(auth, new DefaultHttpContext())
                .Login(new LoginRequest("zed", "irrelevant")));
        }
    }

    [Fact]
    public async Task Me_ReturnsUser_WithoutHash_OrArabic401()
    {
        var (db, auth) = Fresh();
        using (db)
        {
            var user = SeedUser(db, auth, permissions:
                [new UserPermission { Permission = Permissions.GroupsView }]);
            var authed = new DefaultHttpContext();
            WithCookie(authed, auth.CreateSessionToken(user));
            var ok = Assert.IsType<OkObjectResult>(
                await Controller(auth, authed).Me());
            var current = Assert.IsType<CurrentUserDto>(ok.Value);
            Assert.Equal("alice", current.Username);
            Assert.DoesNotContain(nameof(User.PasswordHash),
                string.Join(",", current.GetType().GetProperties().Select(p => p.Name)));

            var anon = Assert.IsType<UnauthorizedObjectResult>(
                await Controller(auth, new DefaultHttpContext()).Me());
            var failure = Assert.IsType<ApiResponse>(anon.Value);
            Assert.False(failure.Ok);
            Assert.Equal("انتهت الجلسة. يرجى تسجيل الدخول من جديد.", failure.Message);
        }
    }

    [Fact]
    public async Task GetCurrentUser_RejectsInactive_Renamed_Tampered()
    {
        var (db, auth) = Fresh();
        using (db)
        {
            var user = SeedUser(db, auth);
            var token = auth.CreateSessionToken(user);

            var okCtx = new DefaultHttpContext();
            WithCookie(okCtx, token);
            Assert.NotNull(await auth.GetSessionUserAsync(TokenOf(okCtx)));

            user.IsActive = false;
            db.SaveChanges();
            var inactiveCtx = new DefaultHttpContext();
            WithCookie(inactiveCtx, token);
            Assert.Null(await auth.GetSessionUserAsync(TokenOf(inactiveCtx)));
            user.IsActive = true;

            user.Username = "renamed";
            db.SaveChanges();
            var renamedCtx = new DefaultHttpContext();
            WithCookie(renamedCtx, token);
            Assert.Null(await auth.GetSessionUserAsync(TokenOf(renamedCtx)));
            user.Username = "alice";
            db.SaveChanges();

            var tamperedCtx = new DefaultHttpContext();
            WithCookie(tamperedCtx, token[..^2] + "xx");
            Assert.Null(await auth.GetSessionUserAsync(TokenOf(tamperedCtx)));

            Assert.Null(await auth.GetSessionUserAsync(TokenOf(new DefaultHttpContext())));
        }
    }

    [Fact]
    public void Logout_ClearsCookie()
    {
        var (db, auth) = Fresh();
        using (db)
        {
            var http = new DefaultHttpContext();
            var result = Controller(auth, http).Logout();
            Assert.IsType<OkObjectResult>(result);
            var cookies = SetCookies(http);
            Assert.Contains($"{SessionCookie.Name}=", cookies);
            Assert.Contains("1970", cookies, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task GroupsList_Unauthenticated401_ScopedReadsHidden404()
    {
        using var db = TestHelpers.InMemoryDb();
        using (db)
        {
            var auth = TestHelpers.Auth(db);
            var groups = new StubGroups();

            var anon = new GroupsController(groups, auth)
            {
                ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
            };
            Assert.IsType<UnauthorizedObjectResult>(await anon.List());

            // V1 groups page: any signed-in user keeps scoped read links;
            // management stays behind groups.view (UI-gated + mutation-checked).
            var user = SeedUser(db, auth, permissions:
                [new UserPermission { Permission = Permissions.UploadView }]);
            var authed = new DefaultHttpContext();
            WithCookie(authed, auth.CreateSessionToken(user));
            var scoped = new GroupsController(groups, auth)
            {
                ControllerContext = new ControllerContext { HttpContext = authed },
            };
            Assert.IsType<OkObjectResult>(await scoped.List());

            // Valid-but-invisible group id stays a hidden 404.
            var hidden = Assert.IsType<NotFoundObjectResult>(await scoped.Get(Guid.NewGuid()));
            Assert.Equal(404, hidden.StatusCode);
        }
    }
}
