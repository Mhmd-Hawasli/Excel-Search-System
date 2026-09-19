using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.EditDto;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class EditsController(IEditsService edits, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpGet("edits")]
    public async Task<IActionResult> List([FromQuery] string? view = "summary", [FromQuery] Guid? fileId = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25,
        [FromQuery] string? person = null, [FromQuery] string? column = null,
        [FromQuery] string? oldValue = null, [FromQuery] string? newValue = null,
        [FromQuery] int? version = null, [FromQuery] string? fromDate = null,
        [FromQuery] string? toDate = null, [FromQuery] string? user = null,
        [FromQuery] string? sortBy = null, [FromQuery] string? sortDir = "desc")
    {
        var currentUser = await RequirePermissionAsync(Permissions.EditsView);
        if (currentUser is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        Response.Headers.CacheControl = "no-store";
        var scope = await Auth.ResolveDataScope(currentUser);
        if (view == "summary")
            return Ok(new { files = await edits.SummaryAsync(scope) });
        if (fileId is not null && scope.FileIds is not null && !scope.FileIds.Contains(fileId.Value))
            return HiddenNotFound();
        return Ok(await edits.ListAsync(fileId, scope, page, pageSize, person, column, oldValue, newValue, version, fromDate, toDate, user, sortBy, sortDir));
    }

    [HttpPost("edits/revert")]
    public async Task<IActionResult> Revert([FromBody] RevertEditRequest body)
    {
        var currentUser = await RequirePermissionAsync(Permissions.EditsUpdate);
        if (currentUser is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var scope = await Auth.ResolveDataScope(currentUser);
        var result = await edits.RevertAsync(body.RecordId, body.FileColumnId, body.HeaderRaw, currentUser.Username, scope);
        return Ok(result);
    }
}
