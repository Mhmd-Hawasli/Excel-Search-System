using System.Text.Json;
using ExcelArchive.Application.DTOs.UserDto;
using ExcelArchive.Application.Services;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using ExcelArchive.Api.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P6.6: HTTP own-account guards on the users controller —
/// self-disable, self-delete and self-permission-change are rejected 422
/// before touching the database (V1 users/[id] routes).</summary>
public sealed class UserControllerPhase6Tests
{
    private sealed class AllowAuth(CurrentUserDto user) : IAuthService
    {
        public string CreateSessionToken(User u) => "";
        public SessionPayload? ValidateSessionToken(string? token) => null;
        public bool VerifyPassword(string password, string storedHash) => false;
        public string HashPassword(string password) => "hash:" + password;
        public Task<CurrentUserDto?> GetSessionUserAsync(string? sessionToken, CancellationToken ct = default)
            => Task.FromResult<CurrentUserDto?>(user);
        public Task<(User User, string Token)?> LoginAsync(string username, string password, CancellationToken ct = default)
            => Task.FromResult<(User User, string Token)?>(null);
        public bool HasPermission(CurrentUserDto u, string key) => true;
        public Task<DataScopeDto> ResolveDataScope(CurrentUserDto u, CancellationToken ct = default)
            => Task.FromResult(new DataScopeDto());
    }

    private static (AppDbContext Db, UsersController Ctrl, CurrentUserDto Me) Setup()
    {
        var db = TestHelpers.InMemoryDb();
        var me = new CurrentUserDto(Guid.NewGuid(), "admin", null, []);
        var auth = new AllowAuth(me);
        var users = new UserService(TestHelpers.Uow(db), auth, new ActivityService(TestHelpers.Uow(db)));
        var ctrl = new UsersController(users, auth)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
        ctrl.HttpContext.Items["CurrentUser"] = me;
        return (db, ctrl, me);
    }

    private static int Status(IActionResult result) => result switch
    {
        ObjectResult o => o.StatusCode ?? 200,
        StatusCodeResult s => s.StatusCode,
        _ => 200,
    };

    private static JsonElement Payload(IActionResult result)
    {
        var value = ((ObjectResult)result).Value!;
        using var doc = System.Text.Json.JsonDocument.Parse(
            System.Text.Json.JsonSerializer.Serialize(value));
        return doc.RootElement.Clone();
    }

    [Fact]
    public async Task Patch_SelfDisable_Rejected422()
    {
        var (_, ctrl, me) = Setup();
        var body = JsonDocument.Parse("""{"isActive":false}""").RootElement;
        var result = await ctrl.Update(me.Id, body);
        Assert.Equal(422, Status(result));
    }

    [Fact]
    public async Task Delete_Self_Rejected422()
    {
        var (_, ctrl, me) = Setup();
        var result = await ctrl.Delete(me.Id);
        Assert.Equal(422, Status(result));
    }

    [Fact]
    public async Task ReplacePermissions_Self_Rejected422()
    {
        var (_, ctrl, me) = Setup();
        var result = await ctrl.ReplacePermissions(me.Id,
            new ExcelArchive.Application.DTOs.UserDto.ReplacePermissionsRequest([]));
        Assert.Equal(422, Status(result));
    }

    [Fact]
    public async Task Patch_MissingUser_Hidden404()
    {
        var (_, ctrl, _) = Setup();
        var body = JsonDocument.Parse("""{"displayName":"x"}""").RootElement;
        var result = await ctrl.Update(Guid.NewGuid(), body);
        Assert.Equal(404, Status(result));
    }

    [Fact]
    public async Task Patch_PresenceSemantics_EndToEnd()
    {
        var (_, ctrl, _) = Setup();
        var created = await ctrl.Create(new ExcelArchive.Application.DTOs.UserDto.CreateUserRequest(
            "httpatch", "secret12", "عرض", true, []));
        var id = Payload(created).GetProperty("Data").GetProperty("user").GetProperty("Id").GetGuid();
        var displayOnly = JsonDocument.Parse("""{"displayName":"جديد"}""").RootElement;
        var updated = await ctrl.Update(id, displayOnly);
        Assert.Equal(200, Status(updated));
        var user = Payload(updated).GetProperty("Data").GetProperty("user");
        Assert.Equal("جديد", user.GetProperty("DisplayName").GetString());
        Assert.True(user.GetProperty("IsActive").GetBoolean());
    }
}
