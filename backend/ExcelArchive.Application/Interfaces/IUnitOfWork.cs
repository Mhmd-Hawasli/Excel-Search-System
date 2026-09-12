using ExcelArchive.Application.Interfaces.Repositories;

namespace ExcelArchive.Application.Interfaces;

/// <summary>
/// Coordinates persistence across the repositories that share one
/// scoped data context, so multi-aggregate use cases commit once.
/// Raw-SQL/atomic operations (job claim) keep their own boundaries and are
/// documented on the owning repository.
/// </summary>
public interface IUnitOfWork
{
    IUserRepository Users { get; }
    IGroupRepository Groups { get; }
    IFileRepository Files { get; }
    IRecordRepository Records { get; }
    IActivityLogRepository ActivityLogs { get; }
    IUploadJobRepository UploadJobs { get; }
    ICategoryRepository Categories { get; }
    IFileColumnRepository FileColumns { get; }
    IRecordEditRepository RecordEdits { get; }
    IDataQualityRepository DataQuality { get; }
    IMappingTemplateRepository MappingTemplates { get; }

    Task<int> SaveChangesAsync(CancellationToken ct = default);

    /// <summary>
    /// Runs <paramref name="action"/> inside the Npgsql execution strategy
    /// with an explicit transaction (commit on success, rollback on failure).
    /// </summary>
    Task ExecuteInTransactionAsync(Func<Task> action, CancellationToken ct = default);
}
