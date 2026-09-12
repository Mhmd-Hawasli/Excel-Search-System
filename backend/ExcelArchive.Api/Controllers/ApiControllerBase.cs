using ExcelArchive.Api.Common.Http;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Common;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

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
        var user = CurrentUser ?? await Auth.GetSessionUserAsync(Request.Cookies[SessionCookie.Name]);
        if (user is not null) HttpContext.Items["CurrentUser"] = user;
        return user is not null && Auth.HasPermission(user, key) ? user : null;
    }

    protected IActionResult UnauthorizedSession() =>
        Unauthorized(ApiResponse.Failure("انتهت الجلسة. يرجى تسجيل الدخول من جديد."));

    protected IActionResult HiddenNotFound() =>
        NotFound(ApiResponse.Failure("غير موجود."));

    protected IActionResult Bad(string message, int status = StatusCodes.Status400BadRequest) =>
        StatusCode(status, ApiResponse.Failure(message));

    protected IActionResult HandleError(Exception ex)
    {
        // Never swallow server errors silently: production diagnostics depend
        // on this log line (e.g. the /merge/export 500 with real user data).
        HttpContext.RequestServices
            .GetRequiredService<ILogger<ApiControllerBase>>()
            .LogError(ex, "Request {Method} {Path} failed with {ErrorType}: {ErrorMessage}",
                Request.Method, Request.Path, ex.GetType().FullName, ex.Message);
        return ex switch
        {
            KeyNotFoundException => NotFound(ApiResponse.Failure(ex.Message)),
            ConflictException => StatusCode(StatusCodes.Status409Conflict, ApiResponse.Failure(ex.Message)),
            InvalidOperationException => Bad(ex.Message, StatusCodes.Status422UnprocessableEntity),
            InvalidDataException => Bad(ex.Message),
            _ => StatusCode(StatusCodes.Status500InternalServerError,
                ApiResponse.Failure("تعذر إكمال الطلب. تحقق من اتصال الخادم وقاعدة البيانات.")),
        };
    }
}
