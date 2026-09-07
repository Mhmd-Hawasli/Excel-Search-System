using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class EditsController(IEditsService edits, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpGet("edits")]
    public async Task<IActionResult> List([FromQuery] string? view = "summary", [FromQuery] Guid? fileId = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        var user = await RequirePermissionAsync(Permissions.EditsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var scope = await auth.ResolveDataScope(user);
        if (view == "summary")
            return Ok(new { files = await edits.SummaryAsync(scope) });
        if (fileId is not null && scope.FileIds is not null && !scope.FileIds.Contains(fileId.Value))
            return HiddenNotFound();
        return Ok(await edits.ListAsync(fileId, scope, page, pageSize));
    }
}
