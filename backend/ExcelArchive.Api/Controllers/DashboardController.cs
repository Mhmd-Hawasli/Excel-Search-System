using ExcelArchive.Application.Common;
using ExcelArchive.Api.Common.Http;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

/// <summary>Scoped dashboard read (docs/05: GET dashboard). Any authenticated user;
/// sections are gated client-side from /api/auth/me like V1.</summary>
public class DashboardController(IDashboardService dashboard, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpGet("dashboard")]
    public async Task<IActionResult> Get()
    {
        var user = CurrentUser ?? await Auth.GetSessionUserAsync(Request.Cookies[SessionCookie.Name]);
        if (user is null) return UnauthorizedSession();
        var result = await dashboard.GetAsync(user);
        return Ok(ApiResponse.Success(new
        {
            groupCount = result.GroupCount,
            fileCount = result.FileCount,
            recordCount = result.RecordCount,
            recentFiles = result.RecentFiles,
        }));
    }
}
