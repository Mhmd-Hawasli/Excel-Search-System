using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IExportTemplateRepository : IRepositoryBase<ExportTemplate>
{
    Task<IReadOnlyList<ExportTemplate>> ListAsync(CancellationToken ct = default);
    Task<IReadOnlyList<ExportTemplate>> ListByFileAsync(Guid fileId, CancellationToken ct = default);
    Task<IReadOnlyList<ExportTemplate>> ListByFileIdsAsync(IEnumerable<Guid> fileIds, CancellationToken ct = default);
    Task<bool> ExistsAsync(Guid fileId, string name, CancellationToken ct = default);
    Task<bool> ExistsOtherAsync(Guid id, Guid fileId, string name, CancellationToken ct = default);
}
