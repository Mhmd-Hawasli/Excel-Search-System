using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Repositories;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class DataQualityRepository(AppDbContext db) : RepositoryBase<DataQualityIssue>(db), IDataQualityRepository
{
    public Task<int> CountByFileAsync(Guid fileId, CancellationToken ct = default)
        => Db.DataQualityIssues.CountAsync(q => q.FileId == fileId, ct);

    public async Task<IReadOnlyList<DataQualityIssue>> ListByFileAsync(Guid fileId, CancellationToken ct = default)
        => await Db.DataQualityIssues.AsNoTracking()
            .Where(q => q.FileId == fileId).OrderBy(q => q.RowIndex).ToListAsync(ct);

    public async Task<IReadOnlyList<DataQualityIssue>> ListRebuildableAsync(Guid fileId, int rowIndex, IReadOnlyList<DataQualityIssueType> types, CancellationToken ct = default)
        => await Db.DataQualityIssues
            .Where(i => i.FileId == fileId && i.RowIndex == rowIndex && types.Contains(i.IssueType))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<DataQualityIssue>> ListByFileRowTypeAsync(Guid fileId, int rowIndex, DataQualityIssueType type, CancellationToken ct = default)
        => await Db.DataQualityIssues
            .Where(i => i.FileId == fileId && i.RowIndex == rowIndex && i.IssueType == type)
            .ToListAsync(ct);

    public Task<bool> ExistsDupeAsync(Guid fileId, int rowIndex, CancellationToken ct = default)
        => Db.DataQualityIssues.AnyAsync(i =>
            i.FileId == fileId && i.RowIndex == rowIndex
            && i.IssueType == DataQualityIssueType.DuplicateNationalId, ct);

    public async Task<IReadOnlyList<DataQualityIssue>> ListNonEmptyByFileAsync(Guid fileId, CancellationToken ct = default)
        => await Db.DataQualityIssues
            .Where(q => q.FileId == fileId && q.IssueType != DataQualityIssueType.EmptyRow)
            .ToListAsync(ct);
}
