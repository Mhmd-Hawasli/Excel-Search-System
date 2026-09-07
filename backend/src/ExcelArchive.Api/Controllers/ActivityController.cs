using ExcelArchive.Api.DTOs.Activity;
using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class ActivityController(IActivityService activity, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpGet("activity")]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 50,
        [FromQuery] string? action = null, [FromQuery] string? search = null)
    {
        var user = await RequirePermissionAsync(Permissions.ActivityView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        return Ok(await activity.ListAsync(new ActivityFilterRequest(page, pageSize, action, search)));
    }
}
