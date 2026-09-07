using ExcelArchive.Api.Services.Abstractions;

namespace ExcelArchive.Api.Middleware;

public class AuthMiddleware(RequestDelegate next, ILogger<AuthMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context, IAuthService auth)
    {
        try
        {
            var user = await auth.GetCurrentUser(context);
            if (user is not null)
            {
                context.Items["CurrentUser"] = user;
            }
        }
        catch (Exception ex)
        {
            // Authentication failures should not take down the request pipeline.
            logger.LogWarning(ex, "Failed to resolve current user for {Path}", context.Request.Path);
        }

        await next(context);
    }
}
