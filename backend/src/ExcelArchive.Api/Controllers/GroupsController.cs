using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Common;
using ExcelArchive.Api.DTOs.Files;
using ExcelArchive.Api.DTOs.Groups;
using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Controllers;

public class GroupsController(IGroupService groups, IAuthService auth, AppDbContext db) : ApiControllerBase(auth)
{
    [HttpGet("groups")]
    public async Task<IActionResult> List()
    {
        var user = await RequirePermissionAsync(Permissions.GroupsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        return Ok(ApiResponse.Success(new { groups = await groups.ListAsync() }));
    }

    [HttpGet("groups/{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.GroupsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var group = await groups.GetAsync(id);
        return group is null ? HiddenNotFound() : Ok(ApiResponse.Success(new { group }));
    }

    [HttpGet("groups/{id:guid}/files")]
    public async Task<IActionResult> ListFiles(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.GroupsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var files = await db.Files.AsNoTracking().Include(f => f.Group)
            .Where(f => f.GroupId == id)
            .OrderByDescending(f => f.UploadedAt)
            .Select(f => new FileDto(f.Id, f.GroupId, f.Name, f.Description, f.OriginalFilename, f.SheetName,
                f.RowCount, f.ColumnSignature, f.Version, f.UploadedAt, f.UpdatedAt, f.Group.Name,
                f.Columns.Count))
            .ToListAsync();
        return Ok(ApiResponse.Success(new { files }));
    }

    [HttpPost("groups")]
    public async Task<IActionResult> Create([FromBody] CreateGroupRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.GroupsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            return StatusCode(StatusCodes.Status201Created,
                ApiResponse.Success(new { group = await groups.CreateAsync(request, user.Username) }, "تم إنشاء المجموعة."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPatch("groups/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateGroupRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.GroupsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            return Ok(ApiResponse.Success(new { group = await groups.UpdateAsync(id, request, user.Username) }, "تم حفظ تعديلات المجموعة."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPost("groups/{id:guid}/reorder")]
    public async Task<IActionResult> Reorder(Guid id, [FromBody] ReorderGroupRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.GroupsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            await groups.ReorderAsync(id, request.Direction, user.Username);
            return Ok(ApiResponse.Success(null, "تم حفظ ترتيب المجموعات."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpDelete("groups/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, [FromBody] DeleteGroupRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.GroupsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            await groups.DeleteAsync(id, request.ConfirmName, user.Username);
            return Ok(ApiResponse.Success(null, "تم حذف المجموعة وكل ملفاتها وسجلاتها."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }
}
