using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class FileVersionRepository(AppDbContext db) : RepositoryBase<FileVersion>(db), IFileVersionRepository
{
    public async Task<IReadOnlyList<FileVersion>> ListByFileAsync(Guid fileId, CancellationToken ct = default)
        => await Db.FileVersions.AsNoTracking()
            .Where(v => v.FileId == fileId)
            .OrderBy(v => v.Version)
            .ToListAsync(ct);
}
