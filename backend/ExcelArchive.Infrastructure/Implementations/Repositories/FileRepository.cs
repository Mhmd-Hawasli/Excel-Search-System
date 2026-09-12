using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Repositories;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using FileEntity = ExcelArchive.Domain.Entities.File;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class FileRepository(AppDbContext db) : RepositoryBase<FileEntity>(db), IFileRepository
{
    public Task<bool> NameExistsAsync(string name, CancellationToken ct = default)
        => Db.Files.AnyAsync(f => f.Name == name, ct);

    public Task<FileEntity?> FindWithGroupAsync(Guid id, CancellationToken ct = default)
        => Db.Files.AsNoTracking().Include(f => f.Group).Include(f => f.Columns)
            .FirstOrDefaultAsync(f => f.Id == id, ct);

    public Task<FileEntity?> FindWithColumnsAsync(Guid id, CancellationToken ct = default)
        => Db.Files
            .Include(f => f.Group)
            .Include(f => f.Columns.OrderBy(c => c.ColumnIndex))
            .ThenInclude(c => c.Category)
            .FirstOrDefaultAsync(f => f.Id == id, ct);

    public async Task<IReadOnlyList<Guid>> FileIdsByGroupIdsAsync(IEnumerable<Guid> groupIds, CancellationToken ct = default)
        => await Db.Files.AsNoTracking()
            .Where(f => groupIds.Contains(f.GroupId))
            .Select(f => f.Id)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Guid>> GroupIdsByFileIdsAsync(IEnumerable<Guid> fileIds, CancellationToken ct = default)
        => await Db.Files.AsNoTracking()
            .Where(f => fileIds.Contains(f.Id))
            .Select(f => f.GroupId)
            .ToListAsync(ct);

    public Task<int> CountByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default)
        => Db.Files.CountAsync(f => ids.Contains(f.Id), ct);

    public async Task<IReadOnlyList<Guid>> AllFileIdsAsync(CancellationToken ct = default)
        => await Db.Files.AsNoTracking().Select(f => f.Id).ToListAsync(ct);

    public async Task<Dictionary<Guid, (int Files, long Records)>> CountByGroupAsync(IReadOnlyList<Guid>? fileIds, CancellationToken ct = default)
    {
        var query = Db.Files.AsNoTracking().AsQueryable();
        if (fileIds is not null) query = query.Where(f => fileIds.Contains(f.Id));
        var rows = await query
            .GroupBy(f => f.GroupId)
            .Select(g => new { GroupId = g.Key, Files = g.Count(), Records = g.Sum(f => (long)f.RowCount) })
            .ToListAsync(ct);
        return rows.ToDictionary(r => r.GroupId, r => (r.Files, r.Records));
    }

    public async Task<IReadOnlyList<FileEntity>> ListScopedAsync(IReadOnlyList<Guid>? fileIds, CancellationToken ct = default)
    {
        var query = Db.Files.AsNoTracking().AsQueryable();
        if (fileIds is not null) query = query.Where(f => fileIds.Contains(f.Id));
        return await query.ToListAsync(ct);
    }

    public async Task<IReadOnlyList<FileEntity>> ListByGroupAsync(Guid groupId, IReadOnlyList<Guid>? fileIds, CancellationToken ct = default)
    {
        var query = Db.Files.AsNoTracking().Where(f => f.GroupId == groupId);
        if (fileIds is not null) query = query.Where(f => fileIds.Contains(f.Id));
        return await query.Include(f => f.Columns).OrderByDescending(f => f.UploadedAt).ToListAsync(ct);
    }

    public async Task<IReadOnlyList<FileEntity>> ListRecentAsync(IReadOnlyList<Guid>? fileIds, int take, CancellationToken ct = default)
    {
        var query = Db.Files.AsNoTracking().AsQueryable();
        if (fileIds is not null) query = query.Where(f => fileIds.Contains(f.Id));
        return await query
            .Include(f => f.Group)
            .Include(f => f.Columns)
            .OrderByDescending(f => f.UploadedAt)
            .Take(take)
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<FileEntity>> ListWithGroupByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default)
        => await Db.Files.AsNoTracking().Include(f => f.Group)
            .Where(f => ids.Contains(f.Id)).ToListAsync(ct);

    public async Task AddAsync(FileEntity file, CancellationToken ct = default)
    {
        Db.Files.Add(file);
        try
        {
            await Db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            throw new InvalidOperationException("اسم الملف مستخدم بالفعل. اختر اسمًا آخر.");
        }
    }

    private static bool IsUniqueViolation(DbUpdateException ex)
        => ex.InnerException is Npgsql.PostgresException pg && pg.SqlState == Npgsql.PostgresErrorCodes.UniqueViolation;
}
