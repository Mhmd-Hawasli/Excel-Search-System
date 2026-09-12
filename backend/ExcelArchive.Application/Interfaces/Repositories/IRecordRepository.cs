using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IRecordRepository : IRepositoryBase<Record>
{
    Task<Record?> FindDetailAsync(Guid id, CancellationToken ct = default);
    Task<Record?> FindWithFileAsync(Guid id, CancellationToken ct = default);
    Task<Record?> FindReadOnlyAsync(Guid id, CancellationToken ct = default);
    Task<Record?> FindByFileAndRowAsync(Guid fileId, int rowIndex, CancellationToken ct = default);
    Task<IReadOnlyList<Record>> ListPeopleByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default);
    Task<IReadOnlyList<int>> RowIndicesByNationalAsync(Guid fileId, long nationalNum, CancellationToken ct = default);
    Task<int> CountByNationalAsync(Guid fileId, long nationalNum, CancellationToken ct = default);
    Task<IReadOnlyList<Record>> RelatedByNationalIdAsync(long nationalNum, Guid excludeId, IReadOnlyList<Guid>? fileIds, int take, CancellationToken ct = default);
    Task<IReadOnlyList<Record>> RelatedByPersonAsync(string fullName, string motherName, Guid excludeId, IReadOnlyList<Guid>? fileIds, int take, CancellationToken ct = default);
    Task<IReadOnlyList<Record>> ConflictByNationalIdAsync(string fullName, long? nationalNum, Guid excludeId, IReadOnlyList<Guid>? fileIds, int take, CancellationToken ct = default);
    Task<IReadOnlyList<Record>> ConflictByMotherAsync(string fullName, string? motherName, Guid excludeId, IReadOnlyList<Guid>? fileIds, int take, CancellationToken ct = default);
    Task<IReadOnlyList<Record>> ListBatchesByFileAsync(Guid fileId, int? afterRow, int take, CancellationToken ct = default);
    Task<IReadOnlyList<Record>> ListExportRowsAsync(Guid fileId, CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> AllIdsAsync(CancellationToken ct = default);
}
