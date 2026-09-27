using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IRecordEditRepository : IRepositoryBase<RecordEdit>
{
    Task<IReadOnlyList<(Guid FileId, int Count, DateTime Last)>> SummaryAsync(IReadOnlyList<Guid>? fileIds, CancellationToken ct = default);
    Task<(IReadOnlyList<RecordEdit> Rows, int Total, int Manual, int Upload, int Formatting)> ListPagedAsync(Guid? fileId, IReadOnlyList<Guid>? fileIds, int page, int pageSize,
        string? person, string? column, string? oldValue, string? newValue,
        int? version, string? fromDate, string? toDate, string? user,
        string? sortBy, string? sortDir, IReadOnlyList<string>? columns,
        IReadOnlyList<string>? users, string? source, CancellationToken ct = default);
    Task<IReadOnlyList<string>> DistinctHeadersAsync(Guid fileId, CancellationToken ct = default);
    Task<IReadOnlyList<string>> DistinctEditorsAsync(Guid fileId, CancellationToken ct = default);
    Task<IReadOnlyList<RecordEdit>> ListByRecordAsync(Guid recordId, CancellationToken ct = default);
    Task<RecordEdit?> LatestByRecordAndHeaderAsync(Guid recordId, string headerRaw, CancellationToken ct = default);
    Task<int> CountByRecordAsync(Guid recordId, CancellationToken ct = default);
    Task<long> CountByFileAsync(Guid fileId, CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> EditedFileIdsAsync(IReadOnlyList<Guid> fileIds, CancellationToken ct = default);
    Task<IReadOnlyList<RecordEdit>> ListByFileAsync(Guid fileId, CancellationToken ct = default);
    // SQL-side aggregates for the versions endpoint (previously the whole
    // file's edits were materialized to count per version in memory).
    Task<Dictionary<int, long>> CountByVersionAsync(Guid fileId, CancellationToken ct = default);
    Task<long> CountPendingAsync(Guid fileId, CancellationToken ct = default);
}
