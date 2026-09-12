using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class RecordRepository(AppDbContext db) : RepositoryBase<Record>(db), IRecordRepository
{
    public Task<Record?> FindDetailAsync(Guid id, CancellationToken ct = default)
        => Db.Records.AsNoTracking()
            .Include(r => r.File).ThenInclude(f => f.Group)
            .Include(r => r.File).ThenInclude(f => f.Columns.OrderBy(c => c.SortOrder).ThenBy(c => c.ColumnIndex))
            .ThenInclude(c => c.Category)
            .FirstOrDefaultAsync(r => r.Id == id, ct);

    public Task<Record?> FindWithFileAsync(Guid id, CancellationToken ct = default)
        => Db.Records.Include(r => r.File).FirstOrDefaultAsync(r => r.Id == id, ct);

    public Task<Record?> FindReadOnlyAsync(Guid id, CancellationToken ct = default)
        => Db.Records.AsNoTracking().Include(r => r.File).FirstOrDefaultAsync(r => r.Id == id, ct);

    public Task<Record?> FindByFileAndRowAsync(Guid fileId, int rowIndex, CancellationToken ct = default)
        => Db.Records.AsNoTracking().FirstOrDefaultAsync(r => r.FileId == fileId && r.RowIndex == rowIndex, ct);

    public async Task<IReadOnlyList<Record>> ListPeopleByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default)
        => await Db.Records.AsNoTracking().Where(r => ids.Contains(r.Id)).ToListAsync(ct);

    public async Task<IReadOnlyList<int>> RowIndicesByNationalAsync(Guid fileId, long nationalNum, CancellationToken ct = default)
        => await Db.Records.AsNoTracking()
            .Where(r => r.FileId == fileId && r.NationalIdNum == nationalNum)
            .Select(r => r.RowIndex).ToListAsync(ct);

    public Task<int> CountByNationalAsync(Guid fileId, long nationalNum, CancellationToken ct = default)
        => Db.Records.CountAsync(r => r.FileId == fileId && r.NationalIdNum == nationalNum, ct);

    private static IQueryable<Record> Visible(IQueryable<Record> query, IReadOnlyList<Guid>? fileIds)
        => fileIds is null ? query : query.Where(r => fileIds.Contains(r.FileId));

    private static IQueryable<Record> WithGraph(IQueryable<Record> query)
        => query.Include(r => r.File).ThenInclude(f => f.Group);

    public async Task<IReadOnlyList<Record>> RelatedByNationalIdAsync(long nationalNum, Guid excludeId, IReadOnlyList<Guid>? fileIds, int take, CancellationToken ct = default)
        => await WithGraph(Visible(Db.Records.AsNoTracking(), fileIds))
            .Where(r => r.NationalIdNum == nationalNum && r.Id != excludeId)
            .OrderByDescending(r => r.CreatedAt).Take(take).ToListAsync(ct);

    public async Task<IReadOnlyList<Record>> RelatedByPersonAsync(string fullName, string motherName, Guid excludeId, IReadOnlyList<Guid>? fileIds, int take, CancellationToken ct = default)
        => await WithGraph(Visible(Db.Records.AsNoTracking(), fileIds))
            .Where(r => r.NFullName == fullName && r.NMotherName == motherName && r.Id != excludeId)
            .OrderByDescending(r => r.CreatedAt).Take(take).ToListAsync(ct);

    public async Task<IReadOnlyList<Record>> ConflictByNationalIdAsync(string fullName, long? nationalNum, Guid excludeId, IReadOnlyList<Guid>? fileIds, int take, CancellationToken ct = default)
        => await WithGraph(Visible(Db.Records.AsNoTracking(), fileIds))
            .Where(r => r.NFullName == fullName && r.NationalIdNum != nationalNum && r.Id != excludeId)
            .OrderByDescending(r => r.CreatedAt).Take(take).ToListAsync(ct);

    public async Task<IReadOnlyList<Record>> ConflictByMotherAsync(string fullName, string? motherName, Guid excludeId, IReadOnlyList<Guid>? fileIds, int take, CancellationToken ct = default)
        => await WithGraph(Visible(Db.Records.AsNoTracking(), fileIds))
            .Where(r => r.NFullName == fullName && r.NMotherName != motherName && r.Id != excludeId)
            .OrderByDescending(r => r.CreatedAt).Take(take).ToListAsync(ct);

    public async Task<IReadOnlyList<Record>> ListBatchesByFileAsync(Guid fileId, int? afterRow, int take, CancellationToken ct = default)
        => await Db.Records
            .Where(r => r.FileId == fileId && (!afterRow.HasValue || r.RowIndex > afterRow.Value))
            .OrderBy(r => r.RowIndex).Take(take).ToListAsync(ct);

    public async Task<IReadOnlyList<Record>> ListExportRowsAsync(Guid fileId, CancellationToken ct = default)
        => await Db.Records.AsNoTracking()
            .Where(r => r.FileId == fileId).OrderBy(r => r.RowIndex).ToListAsync(ct);

    public async Task<IReadOnlyList<Guid>> AllIdsAsync(CancellationToken ct = default)
        => await Db.Records.AsNoTracking().Select(r => r.Id).ToListAsync(ct);
}
