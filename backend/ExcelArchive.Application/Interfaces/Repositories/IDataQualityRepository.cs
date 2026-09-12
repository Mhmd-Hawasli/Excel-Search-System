using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IDataQualityRepository : IRepositoryBase<DataQualityIssue>
{
    Task<int> CountByFileAsync(Guid fileId, CancellationToken ct = default);
    Task<IReadOnlyList<DataQualityIssue>> ListByFileAsync(Guid fileId, CancellationToken ct = default);
    Task<IReadOnlyList<DataQualityIssue>> ListRebuildableAsync(Guid fileId, int rowIndex, IReadOnlyList<DataQualityIssueType> types, CancellationToken ct = default);
    Task<IReadOnlyList<DataQualityIssue>> ListByFileRowTypeAsync(Guid fileId, int rowIndex, DataQualityIssueType type, CancellationToken ct = default);
    Task<bool> ExistsDupeAsync(Guid fileId, int rowIndex, CancellationToken ct = default);
    Task<IReadOnlyList<DataQualityIssue>> ListNonEmptyByFileAsync(Guid fileId, CancellationToken ct = default);
}
