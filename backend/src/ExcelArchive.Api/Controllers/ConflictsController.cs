using ExcelArchive.Api.DTOs.Conflicts;
using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class ConflictsController(IConflictService conflicts, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpGet("conflicts")]
    public async Task<IActionResult> List([FromQuery] string? category = "all", [FromQuery] string? field = "all",
        [FromQuery] string? rule = "all", [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var user = await RequirePermissionAsync(Permissions.ConflictsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var scope = await auth.ResolveDataScope(user);
        var effective = auth.HasPermission(user, Permissions.ConflictsFilters)
            ? new ConflictQueryRequest(category, field, rule, page, pageSize)
            : new ConflictQueryRequest(null, "all", "all", page, pageSize);
        return Ok(await conflicts.ListAsync(effective, scope));
    }

    [HttpGet("conflicts/export")]
    public async Task<IActionResult> Export([FromQuery] string? category = "all", [FromQuery] string? field = "all",
        [FromQuery] string? rule = "all")
    {
        var user = await RequirePermissionAsync(Permissions.ConflictsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var exportUser = await RequirePermissionAsync(Permissions.ExportRun);
        if (exportUser is null) return HiddenNotFound();
        var scope = await auth.ResolveDataScope(user);
        var bytes = await conflicts.ExportAsync(new ConflictQueryRequest(category, field, rule, 1, 20_000), scope);
        var filename = $"تضارب-البيانات-{DateTime.UtcNow:yyyy-MM-dd}.xlsx";
        var encoded = Uri.EscapeDataString(filename);
        Response.Headers.ContentDisposition = $"attachment; filename=\"conflicts.xlsx\"; filename*=UTF-8''{encoded}";
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }

    [HttpPost("conflicts/ignore")]
    public async Task<IActionResult> Ignore([FromBody] IgnoreConflictRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.ConflictsFilters);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            await conflicts.IgnoreAsync(request.Rule, request.RecordId);
            return Ok(new IgnoreConflictResponse(true));
        }
        catch (Exception ex) { return HandleError(ex); }
    }
}
