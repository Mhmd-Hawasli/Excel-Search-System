using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Repositories;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Persistence;

/// <summary>
/// Unit of work sharing a single scoped <see cref="AppDbContext"/> across the
/// injected repositories. Lifetime ownership stays with the DI container.
/// </summary>
public sealed class UnitOfWork(
    AppDbContext db,
    IUserRepository users,
    IGroupRepository groups,
    IFileRepository files,
    IRecordRepository records,
    IActivityLogRepository activityLogs,
    IUploadJobRepository uploadJobs,
    ICategoryRepository categories,
    IFileColumnRepository fileColumns,
    IRecordEditRepository recordEdits,
    IDataQualityRepository dataQuality,
    IMappingTemplateRepository mappingTemplates) : IUnitOfWork
{
    public IUserRepository Users => users;
    public IGroupRepository Groups => groups;
    public IFileRepository Files => files;
    public IRecordRepository Records => records;
    public IActivityLogRepository ActivityLogs => activityLogs;
    public IUploadJobRepository UploadJobs => uploadJobs;
    public ICategoryRepository Categories => categories;
    public IFileColumnRepository FileColumns => fileColumns;
    public IRecordEditRepository RecordEdits => recordEdits;
    public IDataQualityRepository DataQuality => dataQuality;
    public IMappingTemplateRepository MappingTemplates => mappingTemplates;

    public Task<int> SaveChangesAsync(CancellationToken ct = default)
        => db.SaveChangesAsync(ct);

    public async Task ExecuteInTransactionAsync(Func<Task> action, CancellationToken ct = default)
    {
        // Non-relational providers (InMemory tests) have no transactions;
        // callers already save explicitly inside the action.
        if (!db.Database.IsRelational())
        {
            await action();
            return;
        }
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            try
            {
                await action();
                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
            }
            catch
            {
                await tx.RollbackAsync(ct);
                throw;
            }
        });
    }
}
