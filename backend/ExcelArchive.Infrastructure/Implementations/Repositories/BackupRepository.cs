using ExcelArchive.Application.Common;
using ExcelArchive.Application.DTOs.BackupDto;
using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;
using FileEntity = ExcelArchive.Domain.Entities.File;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class BackupRepository(AppDbContext db) : IBackupRepository
{
    public async Task<BackupSnapshot> ReadArchiveAsync(CancellationToken ct = default)
    {
        var groups = await db.Groups.AsNoTracking().OrderBy(g => g.CreatedAt).ToListAsync(ct);
        var categories = await db.Categories.AsNoTracking().OrderBy(c => c.CreatedAt).ToListAsync(ct);
        var files = await db.Files.AsNoTracking().OrderBy(f => f.UploadedAt).ToListAsync(ct);
        var columns = await db.FileColumns.AsNoTracking()
            .OrderBy(c => c.FileId).ThenBy(c => c.ColumnIndex).ToListAsync(ct);
        var records = await db.Records.AsNoTracking()
            .OrderBy(r => r.FileId).ThenBy(r => r.RowIndex).ToListAsync(ct);
        var issues = await db.DataQualityIssues.AsNoTracking().OrderBy(i => i.CreatedAt).ToListAsync(ct);
        var templates = await db.MappingTemplates.AsNoTracking().OrderBy(t => t.CreatedAt).ToListAsync(ct);
        var jobs = await db.UploadJobs.AsNoTracking().OrderBy(j => j.StartedAt).ToListAsync(ct);
        var logs = await db.ActivityLogs.AsNoTracking().OrderBy(a => a.CreatedAt).ToListAsync(ct);
        var edits = await db.RecordEdits.AsNoTracking().OrderBy(e => e.CreatedAt).ToListAsync(ct);
        return new BackupSnapshot(groups, categories, files, columns, records, issues, templates, jobs, logs, edits);
    }

    public async Task ReplaceArchiveAsync(ArchivePlan plan, CancellationToken ct = default)
    {
        if (db.Database.IsRelational())
        {
            var tables = new[]
            {
                db.Model.FindEntityType(typeof(ActivityLog))!,
                db.Model.FindEntityType(typeof(UploadJob))!,
                db.Model.FindEntityType(typeof(RecordEdit))!,
                db.Model.FindEntityType(typeof(DataQualityIssue))!,
                db.Model.FindEntityType(typeof(Record))!,
                db.Model.FindEntityType(typeof(FileColumn))!,
                db.Model.FindEntityType(typeof(MappingTemplate))!,
                db.Model.FindEntityType(typeof(FileEntity))!,
                db.Model.FindEntityType(typeof(Category))!,
                db.Model.FindEntityType(typeof(Domain.Entities.Group))!,
            }.Select(t => $"\"{t.GetTableName()}\"");
            // Archive tables only: users, permission grants, ignored conflicts
            // and conflict cache rows are never truncated here. Permission rows
            // pointing at replaced files cascade away exactly like V1's group
            // deleteMany; the separate accounts transfer restores them.
            // Inside the execution strategy: user transactions must cooperate
            // with the Npgsql retry policy.
            var restoreStrategy = db.Database.CreateExecutionStrategy();
            await restoreStrategy.ExecuteAsync(async () =>
            {
                await using var tx = await db.Database.BeginTransactionAsync(ct);
                try
                {
                    await db.Database.ExecuteSqlRawAsync($"TRUNCATE {string.Join(",", tables)} CASCADE", ct);
                    await InsertPlanAsync(plan, ct);
                    await tx.CommitAsync(ct);
                }
                catch
                {
                    await tx.RollbackAsync(ct);
                    throw new InvalidOperationException("فشلت الاستعادة وتم التراجع عن كل التغييرات. تحقق من سلامة ملف النسخة.");
                }
            });
        }
        else
        {
            // InMemory test provider: FK-ordered removals instead of TRUNCATE.
            db.RecordEdits.RemoveRange(db.RecordEdits);
            db.DataQualityIssues.RemoveRange(db.DataQualityIssues);
            db.Records.RemoveRange(db.Records);
            db.FileColumns.RemoveRange(db.FileColumns);
            db.UploadJobs.RemoveRange(db.UploadJobs);
            db.MappingTemplates.RemoveRange(db.MappingTemplates);
            db.ActivityLogs.RemoveRange(db.ActivityLogs);
            db.Files.RemoveRange(db.Files);
            db.Categories.RemoveRange(db.Categories);
            db.Groups.RemoveRange(db.Groups);
            await db.SaveChangesAsync(ct);
            try
            {
                await InsertPlanAsync(plan, ct);
            }
            catch
            {
                throw new InvalidOperationException("فشلت الاستعادة وتم التراجع عن كل التغييرات. تحقق من سلامة ملف النسخة.");
            }
        }
    }

    private async Task InsertPlanAsync(ArchivePlan plan, CancellationToken ct)
    {
        if (plan.Groups.Count > 0) await db.Groups.AddRangeAsync(plan.Groups, ct);
        if (plan.Categories.Count > 0) await db.Categories.AddRangeAsync(plan.Categories, ct);
        await db.SaveChangesAsync(ct);
        if (plan.Files.Count > 0) await db.Files.AddRangeAsync(plan.Files, ct);
        await db.SaveChangesAsync(ct);
        if (plan.Columns.Count > 0) await db.FileColumns.AddRangeAsync(plan.Columns, ct);
        await db.SaveChangesAsync(ct);
        foreach (var chunk in plan.Records.Chunk(1000))
        {
            await db.Records.AddRangeAsync(chunk, ct);
            await db.SaveChangesAsync(ct);
        }
        if (plan.Issues.Count > 0) await db.DataQualityIssues.AddRangeAsync(plan.Issues, ct);
        if (plan.Templates.Count > 0) await db.MappingTemplates.AddRangeAsync(plan.Templates, ct);
        if (plan.Jobs.Count > 0) await db.UploadJobs.AddRangeAsync(plan.Jobs, ct);
        if (plan.Edits.Count > 0) await db.RecordEdits.AddRangeAsync(plan.Edits, ct);
        if (plan.Logs.Count > 0) await db.ActivityLogs.AddRangeAsync(plan.Logs, ct);
        await db.SaveChangesAsync(ct);
        // Reconcile archive-cascade effects explicitly so every provider
        // matches V1's group deleteMany behavior: the wiped archive rows take
        // their scoped grants and ignored conflicts with them (CASCADE), while
        // user accounts and global grants always survive ordinary restore.
        db.UserPermissions.RemoveRange(db.UserPermissions.Where(p =>
            p.FileId != null || p.GroupId != null));
        db.IgnoredConflicts.RemoveRange(db.IgnoredConflicts);
        await db.SaveChangesAsync(ct);
    }

    public async Task InvalidateConflictCacheAsync(CancellationToken ct = default)
    {
        // Conflict reports are derived: never serve pre-restore payloads.
        db.ConflictQueryCaches.RemoveRange(db.ConflictQueryCaches);
        var state = await db.ConflictCacheStates.FirstOrDefaultAsync(s => s.Id == 1, ct);
        if (state is null) db.ConflictCacheStates.Add(new ConflictCacheState { Id = 1, Revision = 1 });
        else state.Revision += 1;
        await db.SaveChangesAsync(ct);
    }

    public async Task<AccountsSnapshot> ReadAccountsAsync(CancellationToken ct = default)
    {
        var users = await db.Users.AsNoTracking().OrderBy(u => u.CreatedAt).ToListAsync(ct);
        var permissions = await db.UserPermissions.AsNoTracking().OrderBy(p => p.CreatedAt).ToListAsync(ct);
        var ignores = await db.IgnoredConflicts.AsNoTracking().OrderBy(i => i.CreatedAt).ToListAsync(ct);
        return new AccountsSnapshot(users, permissions, ignores);
    }

    public async Task<AccountsImportResult> ImportAccountsAsync(
        IReadOnlyList<User> users,
        IReadOnlyList<UserPermission> permissions,
        IReadOnlyList<IgnoredConflict> ignores,
        CancellationToken ct = default)
    {
        var insertedUsers = 0;
        var insertedPermissions = 0;
        var insertedIgnores = 0;
        async Task Work()
        {
            db.Users.AddRange(users);
            insertedUsers = users.Count;
            await db.SaveChangesAsync(ct);
            var existingGrants = new HashSet<string>(await db.UserPermissions
                .Select(p => p.UserId + "|" + p.Permission + "|" + p.GroupId + "|" + p.FileId)
                .ToListAsync(ct));
            foreach (var p in permissions)
            {
                if (existingGrants.Add(p.UserId + "|" + p.Permission + "|" + p.GroupId + "|" + p.FileId))
                {
                    db.UserPermissions.Add(new UserPermission
                    {
                        Id = p.Id, UserId = p.UserId, Permission = p.Permission,
                        GroupId = p.GroupId, FileId = p.FileId, CreatedAt = p.CreatedAt,
                    });
                    insertedPermissions++;
                }
            }
            var existingIgnores = new HashSet<string>(await db.IgnoredConflicts
                .Select(i => i.Rule + "|" + i.RecordId).ToListAsync(ct));
            foreach (var i in ignores)
            {
                if (existingIgnores.Add(i.Rule + "|" + i.RecordId))
                {
                    db.IgnoredConflicts.Add(new IgnoredConflict
                    {
                        Id = i.Id, Rule = i.Rule, RecordId = i.RecordId, CreatedAt = i.CreatedAt,
                    });
                    insertedIgnores++;
                }
            }
            await db.SaveChangesAsync(ct);
        }
        if (db.Database.IsRelational())
        {
            // Inside the execution strategy: user transactions must
            // cooperate with the Npgsql retry policy.
            var importStrategy = db.Database.CreateExecutionStrategy();
            await importStrategy.ExecuteAsync(async () =>
            {
                await using var tx = await db.Database.BeginTransactionAsync(ct);
                try
                {
                    await Work();
                    await tx.CommitAsync(ct);
                }
                catch
                {
                    await tx.RollbackAsync(ct);
                    throw new InvalidOperationException("فشل الاستيراد وتم التراجع عن كل التغييرات.");
                }
            });
        }
        else
        {
            try
            {
                await Work();
            }
            catch (Exception ex) when (ex is not (ConflictException or InvalidOperationException or InvalidDataException))
            {
                throw new InvalidOperationException("فشل الاستيراد وتم التراجع عن كل التغييرات.");
            }
        }
        return new AccountsImportResult(insertedUsers, insertedPermissions, insertedIgnores);
    }
}
