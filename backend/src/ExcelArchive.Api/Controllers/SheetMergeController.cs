using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class SheetMergeController(IAuthService auth) : ApiControllerBase(auth)
{
    [HttpPost("sheet-merge/upload")]
    [RequestSizeLimit(50 * 1024 * 1024)]
    public IActionResult Upload([FromForm] IFormFile? file)
    {
        var user = CurrentUser;
        if (user is null) return UnauthorizedSession();
        if (!auth.HasPermission(user, Permissions.SheetMergeView)) return HiddenNotFound();
        return Ok(new { sessionId = Guid.NewGuid() });
    }

    [HttpPost("sheet-merge/run")]
    [HttpPost("sheet-merge/export")]
    public IActionResult Run()
    {
        var user = CurrentUser;
        if (user is null) return UnauthorizedSession();
        if (!auth.HasPermission(user, Permissions.SheetMergeView)) return HiddenNotFound();
        return Ok(new { ok = true });
    }

    [HttpGet("sheet-merge/download/{id:guid}")]
    public IActionResult Download(Guid id)
    {
        var user = CurrentUser;
        if (user is null) return UnauthorizedSession();
        if (!auth.HasPermission(user, Permissions.SheetMergeView)) return HiddenNotFound();
        return NotFound();
    }
}
