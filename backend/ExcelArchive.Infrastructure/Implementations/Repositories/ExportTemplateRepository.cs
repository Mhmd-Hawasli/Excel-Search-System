using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class ExportTemplateRepository(AppDbContext db) : RepositoryBase<ExportTemplate>(db), IExportTemplateRepository
{
    public async Task<IReadOnlyList<ExportTemplate>> ListAsync(CancellationToken ct = default)
        => await Db.ExportTemplates.AsNoTracking().Include(t => t.File)
            .OrderByDescending(t => t.UpdatedAt).ToListAsync(ct);

    public async Task<IReadOnlyList<ExportTemplate>> ListByFileAsync(Guid fileId, CancellationToken ct = default)
        => await Db.ExportTemplates.AsNoTracking().Include(t => t.File)
            .Where(t => t.FileId == fileId)
            .OrderByDescending(t => t.UpdatedAt).ToListAsync(ct);

    public async Task<IReadOnlyList<ExportTemplate>> ListByFileIdsAsync(IEnumerable<Guid> fileIds, CancellationToken ct = default)
        => await Db.ExportTemplates.AsNoTracking().Include(t => t.File)
            .Where(t => fileIds.Contains(t.FileId))
            .OrderByDescending(t => t.UpdatedAt).ToListAsync(ct);

    public Task<bool> ExistsAsync(Guid fileId, string name, CancellationToken ct = default)
        => Db.ExportTemplates.AnyAsync(t => t.FileId == fileId && t.Name == name, ct);

    public Task<bool> ExistsOtherAsync(Guid id, Guid fileId, string name, CancellationToken ct = default)
        => Db.ExportTemplates.AnyAsync(t => t.Id != id && t.FileId == fileId && t.Name == name, ct);
}
