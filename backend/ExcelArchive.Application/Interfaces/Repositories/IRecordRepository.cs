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

    // Manual insert (إدخال سجل جديد): file-scoped uniqueness + suggestions.
    Task<int> GetMaxRowIndexAsync(Guid fileId, CancellationToken ct = default);
    Task<bool> ExistsNationalAsync(Guid fileId, string dNationalId, CancellationToken ct = default);
    Task<bool> ExistsShamAsync(Guid fileId, long shamValue, CancellationToken ct = default);
    Task<bool> ExistsPersonalAsync(Guid fileId, string dPersonalNo, CancellationToken ct = default);
    Task<bool> ExistsPhoneAsync(Guid fileId, string dPhone, CancellationToken ct = default);
    Task<bool> ExistsRawAsync(Guid fileId, string headerRaw, string value, CancellationToken ct = default);
    Task<IReadOnlyList<string>> ListDistinctValuesAsync(Guid fileId, string headerRaw, int take, CancellationToken ct = default);

    // Narrow projection for duplicate-quality scanning: row index + the six
    // raw values only (previously whole Record entities with full jsonb were
    // materialized, which made the file-detail page take a minute on files
    // with a few thousand rows).
    Task<IReadOnlyList<DuplicateScanRow>> ListDuplicateScanRowsAsync(Guid fileId,
        string? shamHeader, string? fullHeader, string? firstHeader, string? fatherHeader,
        string? lastHeader, string? motherHeader, CancellationToken ct = default);
}

/// <summary>One row of raw values for duplicate-quality scanning.</summary>
public sealed record DuplicateScanRow(int RowIndex, string Sham, string Full,
    string First, string Father, string Last, string Mother);

