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

        // V2 addition: record_edits.edited_by (who made each edit). EnsureCreated
        // cannot alter an existing database, so the column is added idempotently.
        await db.Database.ExecuteSqlRawAsync(
            "ALTER TABLE record_edits ADD COLUMN IF NOT EXISTS edited_by text");

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

        // Admin account is a real user with specific permissions.
        // Managed manually in the database — seeder must never create or update it,
        // so existing data (display name, status, permissions, password) stays as-is.

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

        // Test account seed (dev/QA convenience: test / test123).
        // Unlike the owner account, the password IS enforced on every boot so
        // the documented test credentials always work after a restart.
        // Override with TEST_USERNAME / TEST_PASSWORD; remove this block (and
        // the compose defaults) before any production deployment.
        var testName = configuration["TEST_USERNAME"] ?? "test";
        var testUser = await db.Users.Include(u => u.Permissions)
            .FirstOrDefaultAsync(u => u.Username == testName);
        if (testUser is null)
        {
            testUser = new ExcelArchive.Domain.Entities.User
            {
                Username = testName,
                PasswordHash = auth.HashPassword(configuration["TEST_PASSWORD"] ?? "test123"),
                DisplayName = "مستخدم التجربة",
                IsActive = true,
            };
            db.Users.Add(testUser);
            await db.SaveChangesAsync();
            testUser = await db.Users.Include(u => u.Permissions)
                .FirstAsync(u => u.Username == testName);
        }
        else
        {
            testUser.IsActive = true;
            testUser.DisplayName = "مستخدم التجربة";
            testUser.PasswordHash = auth.HashPassword(configuration["TEST_PASSWORD"] ?? "test123");
            await db.SaveChangesAsync();
        }
        var staleTestPermissions = testUser.Permissions.ToList();
        if (staleTestPermissions.Count > 0)
        {
            db.UserPermissions.RemoveRange(staleTestPermissions);
            await db.SaveChangesAsync();
        }
        db.UserPermissions.AddRange(Permissions.OwnerGlobals
            .Select(key => new ExcelArchive.Domain.Entities.UserPermission { UserId = testUser.Id, Permission = key }));
        await db.SaveChangesAsync();
    }
}
