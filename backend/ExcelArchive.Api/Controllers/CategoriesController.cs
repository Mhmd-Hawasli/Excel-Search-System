using ExcelArchive.Application.DTOs.CategoryDto;
using ExcelArchive.Application.Common;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class CategoriesController(ICategoryService categories, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpGet("categories")]
    public async Task<IActionResult> List()
    {
        var user = await RequirePermissionAsync(Permissions.CategoriesView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        return Ok(new { categories = await categories.ListAsync() });
    }

    /// <summary>Selector read for upload/mapping wizards (docs/05): upload
    /// permission suffices; no management rights implied.</summary>
    [HttpGet("categories/options")]
    public async Task<IActionResult> Options()
    {
        var user = await RequirePermissionAsync(Permissions.UploadView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var all = await categories.ListAsync();
        return Ok(ApiResponse.Success(new { categories = all.Select(c => new { id = c.Id, name = c.Name }) }));
    }

    [HttpPost("categories")]
    public async Task<IActionResult> Create([FromBody] CreateCategoryRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.CategoriesManage);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try { return Ok(new { category = await categories.CreateAsync(request, user.Username) }); }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPatch("categories/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCategoryRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.CategoriesManage);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try { return Ok(new { category = await categories.UpdateAsync(id, request, user.Username) }); }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPost("categories/{id:guid}/reorder")]
    public async Task<IActionResult> Reorder(Guid id, [FromBody] ReorderCategoryRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.CategoriesManage);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try { await categories.ReorderAsync(id, request.Direction, user.Username); return Ok(new { ok = true }); }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPost("categories/columns/move")]
    public async Task<IActionResult> MoveColumn([FromBody] MoveColumnRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.CategoriesManage);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try { return Ok(new { ok = true, message = await categories.MoveColumnAsync(request.ColumnId, request.CategoryId, user.Username) }); }
        catch (Exception ex) { return HandleError(ex); }
    }

    /// <summary>Global standard-column ordering within one category board
    /// (V1 reorderCategoryColumnGroups): ordered normalized-header group keys.</summary>
    [HttpPost("categories/column-groups/reorder")]
    public async Task<IActionResult> ReorderColumnGroups([FromBody] ReorderColumnGroupsRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.CategoriesManage);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try { await categories.ReorderColumnGroupsAsync(request.CategoryId, request.OrderedGroupKeys, user.Username); return Ok(new { ok = true }); }
        catch (Exception ex) { return HandleError(ex); }
    }

    /// <summary>Grouped column board read (V1 settings/categories page):
    /// server-computed group keys so client and engine never disagree.</summary>
    [HttpGet("categories/board")]
    public async Task<IActionResult> Board()
    {
        var user = await RequirePermissionAsync(Permissions.CategoriesView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        return Ok(new { categories = await categories.BoardAsync() });
    }

    [HttpDelete("categories/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, [FromBody] DeleteCategoryRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.CategoriesManage);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (request.Id != Guid.Empty && request.Id != id)
            return Bad("معرف الفئة في الجسم لا يطابق المسار.");
        try { await categories.DeleteAsync(id, request.ConfirmName, user.Username); return Ok(new { ok = true }); }
        catch (Exception ex) { return HandleError(ex); }
    }
}
