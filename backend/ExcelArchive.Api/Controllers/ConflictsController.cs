using ExcelArchive.Application.Common.Conflicts;
using ExcelArchive.Application.DTOs.ConflictDto;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class ConflictsController(IConflictService conflicts, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpGet("conflicts")]
    public async Task<IActionResult> List([FromQuery] string? category = null, [FromQuery] string? field = null,
        [FromQuery] string? rule = null, [FromQuery] string? page = null, [FromQuery] string? pageSize = null,
        [FromQuery] string? sortBy = null, [FromQuery] string? sortDir = null)
    {
        var user = await RequirePermissionAsync(Permissions.ConflictsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (!ConflictRequestValidator.TryParse(category, field, rule, page, pageSize, sortBy, sortDir, out var parsed) || parsed is null)
            return Bad(ConflictRequestValidator.InvalidMessage);
        var scope = await Auth.ResolveDataScope(user);
        // Without the filters permission the API ignores client-supplied
        // filters (V1 route.ts): fixed invalid/all/all effective request,
        // preserving validated paging/sort.
        var effective = Auth.HasPermission(user, Permissions.ConflictsFilters)
            ? parsed
            : parsed with { Category = "invalid", Field = "all", Rule = "all" };
        var result = await conflicts.ListAsync(effective, scope);
        Response.Headers.CacheControl = "no-store";
        return Ok(result);
    }

    [HttpGet("conflicts/stats")]
    public async Task<IActionResult> Stats()
    {
        var user = await RequirePermissionAsync(Permissions.ConflictsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var scope = await Auth.ResolveDataScope(user);
        var stats = await conflicts.StatsAsync(scope);
        Response.Headers.CacheControl = "no-store";
        return Ok(stats);
    }

    [HttpGet("conflicts/export")]
    public async Task<IActionResult> Export([FromQuery] string? category = null, [FromQuery] string? field = null,
        [FromQuery] string? rule = null, [FromQuery] string? page = null, [FromQuery] string? pageSize = null,
        [FromQuery] string? sortBy = null, [FromQuery] string? sortDir = null)
    {
        var user = await RequirePermissionAsync(Permissions.ConflictsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var exportUser = await RequirePermissionAsync(Permissions.ExportRun);
        if (exportUser is null) return HiddenNotFound();
        if (!ConflictRequestValidator.TryParse(category, field, rule, page, pageSize, sortBy, sortDir, out var parsed) || parsed is null)
            return Bad("معايير التصدير غير صالحة.");
        var scope = await Auth.ResolveDataScope(user);
        var effective = Auth.HasPermission(user, Permissions.ConflictsFilters)
            ? parsed
            : parsed with { Category = "invalid", Field = "all", Rule = "all" };
        var bytes = await conflicts.ExportAsync(effective, scope);
        var filename = $"تضارب-البيانات-{effective.Category}-{DateTime.UtcNow:yyyy-MM-dd}.xlsx";
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
            var scope = await Auth.ResolveDataScope(user);
            await conflicts.IgnoreAsync(request.Rule, request.RecordId, scope);
            return Ok(new IgnoreConflictResponse(true));
        }
        catch (Exception ex) { return HandleError(ex); }
    }
}
