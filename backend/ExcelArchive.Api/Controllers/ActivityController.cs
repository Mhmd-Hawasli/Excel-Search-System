using ExcelArchive.Application.DTOs.ActivityDto;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class ActivityController(IActivityService activity, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpGet("activity")]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 50,
        [FromQuery] string? action = null, [FromQuery] string? search = null)
    {
        // V1 logs page: activity.view opens the page shell, activity.browse
        // gates the rows. Direct data access without browse stays hidden 404.
        var user = await RequirePermissionAsync(Permissions.ActivityBrowse);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        return Ok(await activity.ListAsync(new ActivityFilterRequest(page, pageSize, action, search)));
    }
}
