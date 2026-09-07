using ExcelArchive.Api.DTOs.Auth;
using ExcelArchive.Api.DTOs.Common;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

[ApiController]
[Route("api")]
public abstract class ApiControllerBase(IAuthService auth) : ControllerBase
{
    protected IAuthService Auth { get; } = auth;

    protected CurrentUserDto? CurrentUser => HttpContext.Items["CurrentUser"] as CurrentUserDto;

    protected bool IsAuthenticated => CurrentUser is not null;

    /// <summary>
    /// Returns the current user only when the global permission is present.
    /// null means either signed out (401) or not permitted (404, hidden).
    /// </summary>
    protected async Task<CurrentUserDto?> RequirePermissionAsync(string key)
    {
        var user = CurrentUser ?? await Auth.GetCurrentUser(HttpContext);
        return user is not null && Auth.HasPermission(user, key) ? user : null;
    }

    protected IActionResult UnauthorizedSession() =>
        Unauthorized(ApiResponse.Failure("انتهت الجلسة. يرجى تسجيل الدخول من جديد."));

    protected IActionResult HiddenNotFound() =>
        NotFound(ApiResponse.Failure("غير موجود."));

    protected IActionResult Bad(string message, int status = StatusCodes.Status400BadRequest) =>
        StatusCode(status, ApiResponse.Failure(message));

    protected IActionResult HandleError(Exception ex) => ex switch
    {
        KeyNotFoundException => NotFound(ApiResponse.Failure(ex.Message)),
        InvalidOperationException => Bad(ex.Message, StatusCodes.Status422UnprocessableEntity),
        InvalidDataException => Bad(ex.Message),
        _ => StatusCode(StatusCodes.Status500InternalServerError,
            ApiResponse.Failure("تعذر إكمال الطلب. تحقق من اتصال الخادم وقاعدة البيانات.")),
    };
}
