using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class MappingTemplateRepository(AppDbContext db) : RepositoryBase<MappingTemplate>(db), IMappingTemplateRepository
{
    public async Task<IReadOnlyList<MappingTemplate>> ListAsync(CancellationToken ct = default)
        => await Db.MappingTemplates.AsNoTracking().OrderByDescending(t => t.CreatedAt).ToListAsync(ct);

    public async Task<IReadOnlyList<MappingTemplate>> ListByGroupAsync(Guid groupId, CancellationToken ct = default)
        => await Db.MappingTemplates.AsNoTracking()
            .Where(t => t.GroupId == groupId).OrderByDescending(t => t.CreatedAt).ToListAsync(ct);

    public Task<bool> ExistsAsync(Guid groupId, string name, CancellationToken ct = default)
        => Db.MappingTemplates.AnyAsync(t => t.GroupId == groupId && t.Name == name, ct);
}
