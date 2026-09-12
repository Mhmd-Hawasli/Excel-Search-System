using ExcelArchive.Application.Interfaces.Services;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Persistence;

public static class DbSeeder
{
    public static async Task SeedAsync(IServiceProvider services, IConfiguration configuration)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var auth = scope.ServiceProvider.GetRequiredService<IAuthService>();

        // Code-First bootstrap for the fresh `excel_archive_2` database.
        // No EF migrations ship yet, so EnsureCreated creates all tables
        // from AppDbContext on first boot (idempotent on later boots).
        await db.Database.EnsureCreatedAsync();

        // Install pg_trgm + trigram search indexes idempotently.
        // Required index/cache setup failure must be visible in readiness
        // (docs/04), not merely logged: seeder warns here, /health/ready must
        // still fail until extensions/indexes/triggers verify (P1.6 follow-up).
        try
        {
            foreach (var file in new[] { "Data/SearchIndexes.sql", "Data/ConflictCache.sql" })
            {
                var sqlPath = Path.Combine(AppContext.BaseDirectory, file);
                if (!File.Exists(sqlPath))
                {
                    var candidates = new[]
                    {
                        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "ExcelArchive.Infrastructure", "Implementations", "Persistence", "Sql", file),
                        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "ExcelArchive.Api", file),
                        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "src", "ExcelArchive.Api", file),
                    };
                    foreach (var alt in candidates)
                        if (File.Exists(alt)) { sqlPath = alt; break; }
                }
                if (File.Exists(sqlPath))
                {
                    var sql = await File.ReadAllTextAsync(sqlPath);
                    await db.Database.ExecuteSqlRawAsync(sql);
                }
                else if (file.EndsWith("SearchIndexes.sql"))
                {
                    await db.Database.ExecuteSqlRawAsync("CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;");
                }
            }
        }
        catch (Exception ex)
        {
            var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DbSeeder");
            logger.LogWarning(ex, "Could not install search indexes; continuing without trigram indexes.");
        }

        if (!db.Users.Any())
        {
            var username = configuration["ADMIN_USERNAME"] ?? "admin";
            var password = configuration["ADMIN_PASSWORD"] ?? "admin123";
            db.Users.Add(new ExcelArchive.Domain.Entities.User
            {
                Username = username,
                PasswordHash = auth.HashPassword(password),
                DisplayName = "المدير",
                IsActive = true,
                Permissions = Permissions.OwnerGlobals
                    .Select(key => new ExcelArchive.Domain.Entities.UserPermission { Permission = key })
                    .ToList(),
            });
            await db.SaveChangesAsync();
        }
        else
        {
            // Upgrade path: grant missing canonical owner globals to the admin.
            // Legacy extras already in the DB (groups.manage, search.view) are left
            // untouched; they resolve as no-ops via UnifyDataPermissions/HasPermission.
            var adminName = configuration["ADMIN_USERNAME"] ?? "admin";
            var admin = await db.Users.Include(u => u.Permissions)
                .FirstOrDefaultAsync(u => u.Username == adminName);
            if (admin is not null)
            {
                var missing = Permissions.OwnerGlobals
                    .Except(admin.Permissions
                        .Where(p => p.GroupId is null && p.FileId is null)
                        .Select(p => p.Permission))
                    .Select(key => new ExcelArchive.Domain.Entities.UserPermission { UserId = admin.Id, Permission = key })
                    .ToList();
                if (missing.Count > 0)
                {
                    db.UserPermissions.AddRange(missing);
                    await db.SaveChangesAsync();
                }
            }
        }

        // System owner seed (V1 parity: prisma/seed-owner.ts).
        // The password is only set on creation — re-running never reverts a
        // password changed from the users page — while global permissions are
        // always restored to the full owner set.
        var ownerName = configuration["MHMD_USERNAME"] ?? "mhmd";
        var owner = await db.Users.Include(u => u.Permissions)
            .FirstOrDefaultAsync(u => u.Username == ownerName);
        if (owner is null)
        {
            var ownerPassword = configuration["MHMD_PASSWORD"] ?? "mhmd123";
            owner = new ExcelArchive.Domain.Entities.User
            {
                Username = ownerName,
                PasswordHash = auth.HashPassword(ownerPassword),
                DisplayName = "مالك النظام",
                IsActive = true,
            };
            db.Users.Add(owner);
            await db.SaveChangesAsync();
            owner = await db.Users.Include(u => u.Permissions)
                .FirstAsync(u => u.Username == ownerName);
        }
        else
        {
            owner.IsActive = true;
            owner.DisplayName = "مالك النظام";
            await db.SaveChangesAsync();
        }
        var staleOwnerPermissions = owner.Permissions.ToList();
        if (staleOwnerPermissions.Count > 0)
        {
            db.UserPermissions.RemoveRange(staleOwnerPermissions);
            await db.SaveChangesAsync();
        }
        db.UserPermissions.AddRange(Permissions.OwnerGlobals
            .Select(key => new ExcelArchive.Domain.Entities.UserPermission { UserId = owner.Id, Permission = key }));
        await db.SaveChangesAsync();
    }
}
