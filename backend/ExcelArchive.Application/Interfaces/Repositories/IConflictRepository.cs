using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IConflictRepository : IRepositoryBase<IgnoredConflict>
{
    Task<Guid?> FindRecordFileIdAsync(Guid recordId, CancellationToken ct = default);
    Task<bool> IgnoredExistsAsync(string rule, Guid recordId, CancellationToken ct = default);
    Task AddIgnoreAsync(string rule, Guid recordId, CancellationToken ct = default);
    Task BumpRevisionAsync(CancellationToken ct = default);
    Task<int> IgnoredCountAsync(CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> ActiveJobFileIdsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<Record>> ListConflictRecordsAsync(IReadOnlyList<Guid>? fileIds, CancellationToken ct = default);
    Task<Dictionary<Guid, List<FileColumn>>> ColumnsByFilesAsync(IEnumerable<Guid> fileIds, CancellationToken ct = default);
    Task<IReadOnlyList<IgnoredConflict>> IgnoredByRecordIdsAsync(IEnumerable<Guid> recordIds, CancellationToken ct = default);
}
