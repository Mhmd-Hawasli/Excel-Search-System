using ExcelArchive.Api.Common.Http;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Common;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ExcelArchive.Api.Controllers;

public class AuthController(IAuthService auth) : ApiControllerBase(auth)
{
    [HttpPost("auth/login")]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
            return Bad("يرجى إدخال اسم المستخدم وكلمة المرور.");

        var result = await Auth.LoginAsync(request.Username, request.Password);
        if (result is null)
            return Unauthorized(ApiResponse.Failure("اسم المستخدم أو كلمة المرور غير صحيحة."));

        var (user, token) = result.Value;
        var secure = Request.IsHttps || Request.Headers["X-Forwarded-Proto"].ToString().StartsWith("https");
        Response.Cookies.Append(SessionCookie.Name, token, new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            Secure = secure,
            Path = "/",
            MaxAge = TimeSpan.FromHours(12),
        });
        return Ok(ApiResponse.Success(new LoginResponse(true, user.Username)));
    }

    [HttpGet("auth/me")]
    public async Task<IActionResult> Me()
    {
        var user = await Auth.GetSessionUserAsync(Request.Cookies[SessionCookie.Name]);
        return user is null ? Unauthorized(ApiResponse.Failure("انتهت الجلسة. يرجى تسجيل الدخول من جديد.")) : Ok(user);
    }

    [HttpPost("auth/logout")]
    public IActionResult Logout()
    {
        ClearSessionCookie();
        return Ok(ApiResponse.Success(null, "تم تسجيل الخروج."));
    }

    // GET للمتانة: لو فتح المستخدم /api/auth/logout مباشرة في المتصفح
    // (كما في البلاغ) لا نعرض JSON خام، بل نمسح الكوكي ونوجّه إلى /login.
    // طلبات الـ API (Accept: application/json) تستمر بإرجاع JSON.
    [HttpGet("auth/logout")]
    public IActionResult LogoutGet()
    {
        ClearSessionCookie();
        var accept = Request.Headers.Accept.ToString();
        if (accept.Contains("text/html", StringComparison.OrdinalIgnoreCase))
            return Redirect("/login");
        return Ok(ApiResponse.Success(null, "تم تسجيل الخروج."));
    }

    private void ClearSessionCookie()
    {
        Response.Cookies.Delete(SessionCookie.Name, new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            Secure = Request.IsHttps || Request.Headers["X-Forwarded-Proto"].ToString().StartsWith("https"),
            Path = "/",
        });
    }
}
