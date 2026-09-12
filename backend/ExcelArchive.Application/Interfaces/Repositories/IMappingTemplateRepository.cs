using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IMappingTemplateRepository : IRepositoryBase<MappingTemplate>
{
    Task<IReadOnlyList<MappingTemplate>> ListAsync(CancellationToken ct = default);
    Task<IReadOnlyList<MappingTemplate>> ListByGroupAsync(Guid groupId, CancellationToken ct = default);
    Task<bool> ExistsAsync(Guid groupId, string name, CancellationToken ct = default);
}
