using ExcelArchive.Application.Common;
using ExcelArchive.Api.Common.Http;
using ExcelArchive.Application.DTOs.GroupDto;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class GroupsController(IGroupService groups, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpGet("groups")]
    public async Task<IActionResult> List()
    {
        // V1 groups page: any signed-in user; rows filtered by scope, management
        // controls gated separately. Scoped users keep read links (docs/06 UI-04).
        var user = CurrentUser ?? await Auth.GetSessionUserAsync(Request.Cookies[SessionCookie.Name]);
        if (user is null) return UnauthorizedSession();
        var scope = await Auth.ResolveDataScope(user);
        return Ok(ApiResponse.Success(new { groups = await groups.ListAsync(scope) }));
    }

    [HttpGet("groups/{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var user = CurrentUser ?? await Auth.GetSessionUserAsync(Request.Cookies[SessionCookie.Name]);
        if (user is null) return UnauthorizedSession();
        var detail = await groups.GetDetailAsync(id, user);
        return detail is null ? HiddenNotFound() : Ok(ApiResponse.Success(new { group = detail.Group, files = detail.Files }));
    }

    [HttpGet("groups/{id:guid}/files")]
    public async Task<IActionResult> ListFiles(Guid id)
    {
        var user = CurrentUser ?? await Auth.GetSessionUserAsync(Request.Cookies[SessionCookie.Name]);
        if (user is null) return UnauthorizedSession();
        var detail = await groups.GetDetailAsync(id, user);
        return detail is null ? HiddenNotFound() : Ok(ApiResponse.Success(new { files = detail.Files }));
    }

    [HttpPost("groups")]
    public async Task<IActionResult> Create([FromBody] CreateGroupRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.GroupsCreate);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        // التضمين في البحث الافتراضي يحتاج صلاحية مستقلة: بدونه تُنشأ المجموعة مضمّنة دائماً.
        var effective = Auth.HasPermission(user, Permissions.GroupsDefaultSearch)
            ? request
            : request with { IncludeInDefaultSearch = true };
        try
        {
            return StatusCode(StatusCodes.Status201Created,
                ApiResponse.Success(new { group = await groups.CreateAsync(effective, user.Username) }, "تم إنشاء المجموعة."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPatch("groups/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateGroupRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.GroupsUpdate);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        // بدون صلاحية التضمين يُتجاهل العلم المرسل وتبقى القيمة الحالية كما هي.
        var effective = Auth.HasPermission(user, Permissions.GroupsDefaultSearch)
            ? request
            : request with { IncludeInDefaultSearch = null };
        try
        {
            return Ok(ApiResponse.Success(new { group = await groups.UpdateAsync(id, effective, user.Username) }, "تم حفظ تعديلات المجموعة."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPost("groups/{id:guid}/reorder")]
    public async Task<IActionResult> Reorder(Guid id, [FromBody] ReorderGroupRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.GroupsUpdate);
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
        var user = await RequirePermissionAsync(Permissions.GroupsUpdate);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            await groups.DeleteAsync(id, request.ConfirmName, user.Username);
            return Ok(ApiResponse.Success(null, "تم حذف المجموعة وكل ملفاتها وسجلاتها."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }
}
