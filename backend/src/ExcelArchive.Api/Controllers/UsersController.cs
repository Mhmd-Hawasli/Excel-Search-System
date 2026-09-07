using ExcelArchive.Api.DTOs.Common;
using ExcelArchive.Api.DTOs.Users;
using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class UsersController(IUserService users, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpGet("users")]
    public async Task<IActionResult> List()
    {
        var user = await RequirePermissionAsync(Permissions.UsersView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        return Ok(ApiResponse.Success(new { users = await users.ListAsync() }));
    }

    [HttpPost("users")]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UsersCreate);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            var created = await users.CreateAsync(request, user.Username);
            return StatusCode(StatusCodes.Status201Created, ApiResponse.Success(new { user = created }));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpGet("users/{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.UsersView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var result = await users.GetAsync(id);
        return result is null ? HiddenNotFound() : Ok(ApiResponse.Success(new { user = result }));
    }

    [HttpPatch("users/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUserRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UsersUpdate);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (id == user.Id && !request.IsActive) return Bad("لا يمكنك تعطيل حسابك الخاص.", StatusCodes.Status422UnprocessableEntity);
        try
        {
            var updated = await users.UpdateAsync(id, request, user.Username);
            return Ok(ApiResponse.Success(new { user = updated }));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpDelete("users/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.UsersDelete);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (id == user.Id) return Bad("لا يمكنك حذف حسابك الخاص.", StatusCodes.Status422UnprocessableEntity);
        try
        {
            await users.DeleteAsync(id, user.Username);
            return Ok(ApiResponse.Success(null, "تم حذف المستخدم."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpGet("users/{id:guid}/permissions")]
    public async Task<IActionResult> GetPermissions(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.UsersView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var result = await users.GetAsync(id);
        return result is null ? HiddenNotFound() : Ok(ApiResponse.Success(new
        {
            userId = result.Id,
            username = result.Username,
            permissions = result.Permissions,
        }));
    }

    [HttpPut("users/{id:guid}/permissions")]
    public async Task<IActionResult> ReplacePermissions(Guid id, [FromBody] ReplacePermissionsRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UsersUpdate);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (id == user.Id) return Bad("لا يمكنك تعديل صلاحيات حسابك الخاص.", StatusCodes.Status422UnprocessableEntity);
        try
        {
            return Ok(ApiResponse.Success(await users.ReplacePermissionsAsync(id, request, user.Username)));
        }
        catch (Exception ex) { return HandleError(ex); }
    }
}
