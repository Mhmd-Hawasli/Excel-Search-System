using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class RecordEditRepository(AppDbContext db) : RepositoryBase<RecordEdit>(db), IRecordEditRepository
{
    public async Task<IReadOnlyList<(Guid FileId, int Count, DateTime Last)>> SummaryAsync(IReadOnlyList<Guid>? fileIds, CancellationToken ct = default)
    {
        var query = Db.RecordEdits.AsNoTracking().AsQueryable();
        if (fileIds is not null) query = query.Where(e => fileIds.Contains(e.FileId));
        return await query
            .GroupBy(e => new { e.FileId })
            .Select(g => new { g.Key.FileId, Count = g.Count(), Last = g.Max(x => x.CreatedAt) })
            .ToListAsync(ct)
            .ContinueWith(t => (IReadOnlyList<(Guid, int, DateTime)>)t.Result.Select(r => (r.FileId, r.Count, r.Last)).ToList(), ct);
    }

    public async Task<(IReadOnlyList<RecordEdit> Rows, int Total)> ListPagedAsync(Guid? fileId, IReadOnlyList<Guid>? fileIds, int page, int pageSize, CancellationToken ct = default)
    {
        var query = Db.RecordEdits.AsNoTracking().AsQueryable();
        if (fileId is not null) query = query.Where(e => e.FileId == fileId);
        else if (fileIds is not null) query = query.Where(e => fileIds.Contains(e.FileId));
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(e => e.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return (rows, total);
    }

    public async Task<IReadOnlyList<RecordEdit>> ListByRecordAsync(Guid recordId, CancellationToken ct = default)
        => await Db.RecordEdits.AsNoTracking()
            .Where(e => e.RecordId == recordId)
            .OrderByDescending(e => e.CreatedAt)
            .ToListAsync(ct);

    public Task<RecordEdit?> LatestByRecordAndHeaderAsync(Guid recordId, string headerRaw, CancellationToken ct = default)
        => Db.RecordEdits.AsNoTracking()
            .Where(e => e.RecordId == recordId && e.HeaderRaw == headerRaw)
            .OrderByDescending(e => e.CreatedAt)
            .FirstOrDefaultAsync(ct);

    public Task<int> CountByRecordAsync(Guid recordId, CancellationToken ct = default)
        => Db.RecordEdits.CountAsync(e => e.RecordId == recordId, ct);

    public Task<long> CountByFileAsync(Guid fileId, CancellationToken ct = default)
        => Db.RecordEdits.LongCountAsync(e => e.FileId == fileId, ct);

    public async Task<IReadOnlyList<Guid>> EditedFileIdsAsync(IReadOnlyList<Guid> fileIds, CancellationToken ct = default)
        => await Db.RecordEdits.AsNoTracking()
            .Where(e => fileIds.Contains(e.FileId))
            .Select(e => e.FileId)
            .Distinct()
            .ToListAsync(ct);

    public async Task<IReadOnlyList<RecordEdit>> ListByFileAsync(Guid fileId, CancellationToken ct = default)
        => await Db.RecordEdits.AsNoTracking()
            .Where(e => e.FileId == fileId).OrderBy(e => e.CreatedAt).ToListAsync(ct);
}
