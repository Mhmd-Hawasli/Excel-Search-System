using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Data;

public static class DbSeeder
{
    public static async Task SeedAsync(IServiceProvider services, IConfiguration configuration)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var auth = scope.ServiceProvider.GetRequiredService<IAuthService>();

        if (!db.Users.Any())
        {
            var username = configuration["ADMIN_USERNAME"] ?? "admin";
            var password = configuration["ADMIN_PASSWORD"] ?? "admin123";
            db.Users.Add(new Models.Entities.User
            {
                Username = username,
                PasswordHash = auth.HashPassword(password),
                DisplayName = "المدير",
                IsActive = true,
                Permissions = ExcelArchive.Api.Services.Permissions.All
                    .Where(key => key != ExcelArchive.Api.Services.Permissions.GroupsViewScoped)
                    .Select(key => new Models.Entities.UserPermission { Permission = key })
                    .ToList(),
            });
            await db.SaveChangesAsync();
        }
    }
}
