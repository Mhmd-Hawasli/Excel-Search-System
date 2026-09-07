using System.Text.Json;
using ExcelArchive.Api.DTOs.Common;
using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class MergeController(IAuthService auth) : ApiControllerBase(auth)
{
    [HttpPost("merge/inspect")]
    [HttpPost("merge/key")]
    [HttpPost("merge/sheet")]
    [HttpPost("merge/run")]
    [HttpPost("merge/export")]
    public IActionResult StubPost([FromBody] JsonElement? body)
    {
        var user = CurrentUser;
        if (user is null) return UnauthorizedSession();
        if (!auth.HasPermission(user, Permissions.MergeView)) return HiddenNotFound();
        return Accepted(ApiResponse.Success(new { status = "pending", stage = "merge" }));
    }
}
