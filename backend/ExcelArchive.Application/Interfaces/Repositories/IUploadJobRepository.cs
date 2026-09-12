using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IUploadJobRepository : IRepositoryBase<UploadJob>
{
    /// <summary>Oldest pending job claimed atomically (single winner). Null when idle.</summary>
    Task<Guid?> TryClaimPendingAsync(CancellationToken ct = default);
    Task FailAsync(Guid jobId, string message, CancellationToken ct = default);
    Task<int> RecoverStuckAsync(CancellationToken ct = default);
    Task DeleteFileAsync(Guid fileId, CancellationToken ct = default);
}
