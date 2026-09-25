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

        // Schema only: historical data stays untouched until its approved
        // snapshot is available. Newly imported rows receive server-issued pk.
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE records ADD COLUMN IF NOT EXISTS pk bigint NULL");
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE record_edits ADD COLUMN IF NOT EXISTS pk bigint NULL");
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE files ADD COLUMN IF NOT EXISTS next_pk bigint NOT NULL DEFAULT 1");
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS ix_records_file_id_pk ON records (file_id, pk)");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS ix_record_edits_file_id_pk ON record_edits (file_id, pk)");

        // V2 addition: record_edits.edited_by (who made each edit). EnsureCreated
        // cannot alter an existing database, so the column is added idempotently.
        await db.Database.ExecuteSqlRawAsync(
            "ALTER TABLE record_edits ADD COLUMN IF NOT EXISTS edited_by text");

        // V2 addition: groups.include_in_default_search (default search scope
        // preset). Existing groups stay included; unchecking a group only
        // changes the initial scope of the general search.
        await db.Database.ExecuteSqlRawAsync(
            "ALTER TABLE groups ADD COLUMN IF NOT EXISTS include_in_default_search boolean NOT NULL DEFAULT true");

        // V2 addition: private groups (is_private + owner_user_id +
        // owner_username). Existing groups stay shared (is_private false,
        // null owner), so old data behaves exactly as before; only new
        // "private group" creations set these columns.
        await db.Database.ExecuteSqlRawAsync(
            "ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false");
        await db.Database.ExecuteSqlRawAsync(
            "ALTER TABLE groups ADD COLUMN IF NOT EXISTS owner_user_id uuid NULL");
        await db.Database.ExecuteSqlRawAsync(
            "ALTER TABLE groups ADD COLUMN IF NOT EXISTS owner_username text NOT NULL DEFAULT ''");
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_groups_is_private ON groups (is_private)");
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_groups_owner_user_id ON groups (owner_user_id)");

        // V2 addition: versioned edit archive. File updates used to
        // cascade-delete the whole edit log; instead old edits are re-pointed
        // to the surviving file with their original version stamped, so the
        // history section keeps V1 edits while record pages only ever show
        // current-version edits (archived rows carry a null record_id).
        await db.Database.ExecuteSqlRawAsync(
            "ALTER TABLE record_edits ADD COLUMN IF NOT EXISTS file_version integer NOT NULL DEFAULT 1");
        await db.Database.ExecuteSqlRawAsync(
            "ALTER TABLE record_edits ALTER COLUMN record_id DROP NOT NULL");
        // Surviving live edits predate versioning: they were all made on
        // their file's then-current version (older ones were cascade-deleted
        // before). Archived rows carry a null record_id and are never
        // touched; new edits are stamped at creation, so this only ever
        // repairs pre-upgrade rows.
        await db.Database.ExecuteSqlRawAsync(
            "UPDATE record_edits e SET file_version = f.version FROM files f WHERE f.id = e.file_id AND e.record_id IS NOT NULL AND e.file_version <> f.version");

        // V2 addition: record_edits.national_id (stable person identity for
        // the edit history). Row numbers shift when rows are deleted, so the
        // history resolves records by national ID and shows the live current
        // value instead.
        await db.Database.ExecuteSqlRawAsync(
            "ALTER TABLE record_edits ADD COLUMN IF NOT EXISTS national_id text");
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_record_edits_file_id_national_id ON record_edits (file_id, national_id)");

        // Bulk-audit marker: update-generated rows are version content, never
        // pending manual work (pending counts, preview flags, N+1/N+2 rule).
        await db.Database.ExecuteSqlRawAsync(
            "ALTER TABLE record_edits ADD COLUMN IF NOT EXISTS is_bulk boolean NOT NULL DEFAULT false");
        await db.Database.ExecuteSqlRawAsync(
            "ALTER TABLE record_edits ADD COLUMN IF NOT EXISTS is_formatting boolean NOT NULL DEFAULT false");

        // Version history: every N → N+1 bump (manual bump button or file
        // update) stores WHAT changed here, so version numbers carry a note.
        // Idempotent DDL for existing databases (EnsureCreated covers fresh).
        await db.Database.ExecuteSqlRawAsync("CREATE EXTENSION IF NOT EXISTS pgcrypto");
        await db.Database.ExecuteSqlRawAsync(
            "CREATE TABLE IF NOT EXISTS file_versions (id uuid NOT NULL PRIMARY KEY, file_id uuid NOT NULL REFERENCES files (id) ON DELETE CASCADE, version integer NOT NULL, note text NOT NULL, kind text NOT NULL DEFAULT 'manual', created_by text NULL, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)");
        await db.Database.ExecuteSqlRawAsync(
            "ALTER TABLE file_versions ADD COLUMN IF NOT EXISTS snapshot_gzip bytea NULL");
        await db.Database.ExecuteSqlRawAsync(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_file_versions_file_id_version ON file_versions (file_id, version)");
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS ix_file_versions_file_id ON file_versions (file_id)");
        // Backfill: V1 entry for files created before version history existed,
        // plus one entry per bump already visible in files.version.
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO file_versions (id, file_id, version, note, kind, created_at) SELECT gen_random_uuid(), f.id, 1, 'الإصدار الأول عند رفع الملف.', 'seed', f.uploaded_at FROM files f WHERE NOT EXISTS (SELECT 1 FROM file_versions v WHERE v.file_id = f.id AND v.version = 1)");
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO file_versions (id, file_id, version, note, kind, created_at) SELECT gen_random_uuid(), f.id, gs.v, 'إصدار سابق محفوظ قبل تفعيل سجل الإصدارات.', 'seed', f.updated_at FROM files f CROSS JOIN LATERAL generate_series(2, f.version) AS gs(v) WHERE f.version >= 2 AND NOT EXISTS (SELECT 1 FROM file_versions v WHERE v.file_id = f.id AND v.version = gs.v)");

        // Install pg_trgm + trigram search indexes idempotently.
        // Required index/cache setup failure must be visible in readiness
        // (docs/04), not merely logged: seeder warns here, /health/ready must
        // still fail until extensions/indexes/triggers verify (P1.6 follow-up).
        try
        {
            foreach (var file in new[] { "Data/SearchIndexes.sql", "Data/ConflictCache.sql", "Data/PerformanceIndexes.sql" })
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
        // STRICT: existing mhmd/admin rows are NEVER modified here — no
        // UPDATE/DELETE/RESET of any kind (display name, active flag, password
        // or permissions stay exactly as they are in the database). The seeder
        // only creates the account when it is entirely missing (fresh install),
        // using ADMIN_* (preferred) with MHMD_* fallback for the initial secret.
        var ownerName = configuration["ADMIN_USERNAME"] ?? configuration["MHMD_USERNAME"] ?? "mhmd";
        var owner = await db.Users.Include(u => u.Permissions)
            .FirstOrDefaultAsync(u => u.Username == ownerName);
        if (owner is null)
        {
            var ownerPassword = configuration["ADMIN_PASSWORD"] ?? configuration["MHMD_PASSWORD"] ?? "mhmd123";
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
            db.UserPermissions.AddRange(Permissions.OwnerGlobals
                .Select(key => new ExcelArchive.Domain.Entities.UserPermission { UserId = owner.Id, Permission = key }));
            await db.SaveChangesAsync();
        }
        // Existing owner account: intentionally left untouched.

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
