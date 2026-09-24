using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IFileVersionRepository : IRepositoryBase<FileVersion>
{
    Task<IReadOnlyList<FileVersion>> ListByFileAsync(Guid fileId, CancellationToken ct = default);
}
