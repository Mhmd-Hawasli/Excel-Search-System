using ExcelArchive.Api.Common.Http;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace ExcelArchive.Api.Common.Authorization;

/// <summary>
/// Requires a global permission. Returns 401 when signed out,
/// 404 (hidden) when signed in without the permission — same contract
/// as <c>ApiControllerBase.RequirePermissionAsync</c>.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequirePermissionAttribute(string permission) : Attribute, IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var auth = context.HttpContext.RequestServices.GetRequiredService<IAuthService>();
        var user = await auth.GetSessionUserAsync(context.HttpContext.Request.Cookies[SessionCookie.Name]);
        if (user is null)
        {
            context.Result = new UnauthorizedObjectResult(
                ApiResponse.Failure("انتهت الجلسة. يرجى تسجيل الدخول من جديد."));
            return;
        }

        if (!auth.HasPermission(user, permission))
        {
            context.Result = new NotFoundObjectResult(ApiResponse.Failure("غير موجود."));
        }
    }
}
