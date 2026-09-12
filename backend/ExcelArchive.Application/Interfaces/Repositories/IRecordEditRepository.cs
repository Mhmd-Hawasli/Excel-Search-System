using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IRecordEditRepository : IRepositoryBase<RecordEdit>
{
    Task<IReadOnlyList<(Guid FileId, int Count, DateTime Last)>> SummaryAsync(IReadOnlyList<Guid>? fileIds, CancellationToken ct = default);
    Task<(IReadOnlyList<RecordEdit> Rows, int Total)> ListPagedAsync(Guid? fileId, IReadOnlyList<Guid>? fileIds, int page, int pageSize, CancellationToken ct = default);
    Task<IReadOnlyList<RecordEdit>> ListByRecordAsync(Guid recordId, CancellationToken ct = default);
    Task<RecordEdit?> LatestByRecordAndHeaderAsync(Guid recordId, string headerRaw, CancellationToken ct = default);
    Task<int> CountByRecordAsync(Guid recordId, CancellationToken ct = default);
    Task<long> CountByFileAsync(Guid fileId, CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> EditedFileIdsAsync(IReadOnlyList<Guid> fileIds, CancellationToken ct = default);
    Task<IReadOnlyList<RecordEdit>> ListByFileAsync(Guid fileId, CancellationToken ct = default);
}
