using ExcelArchive.Api.DTOs.Categories;
using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
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
        try { await categories.MoveColumnAsync(request.ColumnId, request.CategoryId, user.Username); return Ok(new { ok = true }); }
        catch (Exception ex) { return HandleError(ex); }
    }
}
