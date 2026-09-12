using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Repositories;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class ConflictRepository(AppDbContext db) : RepositoryBase<IgnoredConflict>(db), IConflictRepository
{
    public async Task<Guid?> FindRecordFileIdAsync(Guid recordId, CancellationToken ct = default)
    {
        var record = await Db.Records.AsNoTracking()
            .Select(r => new { r.Id, r.FileId })
            .FirstOrDefaultAsync(r => r.Id == recordId, ct);
        return record?.FileId;
    }

    public Task<bool> IgnoredExistsAsync(string rule, Guid recordId, CancellationToken ct = default)
        => Db.IgnoredConflicts.AnyAsync(i => i.Rule == rule && i.RecordId == recordId, ct);

    public async Task AddIgnoreAsync(string rule, Guid recordId, CancellationToken ct = default)
    {
        Db.IgnoredConflicts.Add(new IgnoredConflict { Rule = rule, RecordId = recordId });
        try
        {
            await Db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Concurrent upsert won (V1 P2002 → ok).
        }
    }

    public async Task BumpRevisionAsync(CancellationToken ct = default)
    {
        var state = await Db.ConflictCacheStates.FirstOrDefaultAsync(s => s.Id == 1, ct);
        if (state is null)
            Db.ConflictCacheStates.Add(new ConflictCacheState { Id = 1, Revision = 1 });
        else
            state.Revision += 1;
        await Db.SaveChangesAsync(ct);
    }

    public Task<int> IgnoredCountAsync(CancellationToken ct = default)
        => Db.IgnoredConflicts.CountAsync(ct);

    public async Task<IReadOnlyList<Guid>> ActiveJobFileIdsAsync(CancellationToken ct = default)
        => await Db.UploadJobs.AsNoTracking()
            .Where(j => j.FileId != null
                && (j.Status == UploadJobStatus.Pending || j.Status == UploadJobStatus.Parsing || j.Status == UploadJobStatus.Inserting))
            .Select(j => j.FileId!.Value)
            .Distinct()
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Record>> ListConflictRecordsAsync(IReadOnlyList<Guid>? fileIds, CancellationToken ct = default)
    {
        var query = Db.Records.AsNoTracking()
            .Include(r => r.File).ThenInclude(f => f.Group)
            .AsQueryable();
        if (fileIds is not null)
            query = query.Where(r => fileIds.Contains(r.FileId));
        return await query.ToListAsync(ct);
    }

    public async Task<Dictionary<Guid, List<FileColumn>>> ColumnsByFilesAsync(IEnumerable<Guid> fileIds, CancellationToken ct = default)
    {
        var columns = await Db.FileColumns.AsNoTracking()
            .Where(c => fileIds.Contains(c.FileId))
            .ToListAsync(ct);
        return columns.GroupBy(c => c.FileId)
            .ToDictionary(g => g.Key, g => g.OrderBy(c => c.ColumnIndex).ToList());
    }

    public async Task<IReadOnlyList<IgnoredConflict>> IgnoredByRecordIdsAsync(IEnumerable<Guid> recordIds, CancellationToken ct = default)
        => await Db.IgnoredConflicts.AsNoTracking()
            .Where(i => recordIds.Contains(i.RecordId))
            .ToListAsync(ct);
}
