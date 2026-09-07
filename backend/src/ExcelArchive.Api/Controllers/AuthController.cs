using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Auth;
using ExcelArchive.Api.DTOs.Common;
using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Controllers;

public class AuthController(IAuthService auth, AppDbContext db) : ApiControllerBase(auth)
{
    [HttpPost("auth/login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
            return Bad("يرجى إدخال اسم المستخدم وكلمة المرور.");

        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == request.Username.Trim());
        if (user is null || !user.IsActive || !auth.VerifyPassword(request.Password, user.PasswordHash))
            return Unauthorized(ApiResponse.Failure("اسم المستخدم أو كلمة المرور غير صحيحة."));

        var token = auth.CreateSessionToken(user);
        var secure = Request.IsHttps || Request.Headers["X-Forwarded-Proto"].ToString().StartsWith("https");
        Response.Cookies.Append(AuthService.SessionCookieName, token, new CookieOptions
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
        var user = await auth.GetCurrentUser(HttpContext);
        return user is null ? Unauthorized(ApiResponse.Failure("انتهت الجلسة. يرجى تسجيل الدخول من جديد.")) : Ok(user);
    }

    [HttpPost("auth/logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete(AuthService.SessionCookieName, new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            Secure = Request.IsHttps || Request.Headers["X-Forwarded-Proto"].ToString().StartsWith("https"),
            Path = "/",
        });
        return Ok(ApiResponse.Success(null, "تم تسجيل الخروج."));
    }
}
