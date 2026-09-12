using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Repositories;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class UploadJobRepository(AppDbContext db) : RepositoryBase<UploadJob>(db), IUploadJobRepository
{
    public async Task<Guid?> TryClaimPendingAsync(CancellationToken ct = default)
    {
        var id = await Db.UploadJobs.Where(j => j.Status == UploadJobStatus.Pending)
            .OrderBy(j => j.StartedAt).Select(j => j.Id).FirstOrDefaultAsync(ct);
        if (id == Guid.Empty) return null;

        // Atomic claim: exactly one worker wins the race (X08 duplicate claim).
        var claimed = await Db.Database.ExecuteSqlRawAsync(
            "UPDATE upload_jobs SET status = 'parsing', started_at = NOW(), error_message = NULL WHERE id = {0} AND status = 'pending'", id);
        if (claimed == 0) return null;
        return id;
    }

    public async Task FailAsync(Guid jobId, string message, CancellationToken ct = default)
    {
        var job = await Db.UploadJobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null) return;
        job.FileId = null;
        job.Status = UploadJobStatus.Failed;
        job.ErrorMessage = string.IsNullOrWhiteSpace(message) ? "فشل استيراد الملف لسبب غير متوقع."
            : message.Length > 1000 ? message[..1000] : message;
        job.FinishedAt = DateTime.UtcNow;
        await Db.SaveChangesAsync(ct);
    }

    /// <summary>Crash recovery: re-queues jobs stuck in PARSING/INSERTING exactly once.</summary>
    public async Task<int> RecoverStuckAsync(CancellationToken ct = default)
    {
        var stuck = await Db.UploadJobs
            .Where(j => j.Status == UploadJobStatus.Parsing || j.Status == UploadJobStatus.Inserting)
            .ToListAsync(ct);
        foreach (var job in stuck)
        {
            job.Status = UploadJobStatus.Pending;
            job.ErrorMessage = "أعيدت المهمة بعد إعادة تشغيل الخادم.";
        }
        if (stuck.Count > 0) await Db.SaveChangesAsync(ct);
        return stuck.Count;
    }

    public async Task DeleteFileAsync(Guid fileId, CancellationToken ct = default)
    {
        var file = await Db.Files.FirstOrDefaultAsync(f => f.Id == fileId, ct);
        if (file is not null) { Db.Files.Remove(file); await Db.SaveChangesAsync(ct); }
    }
}
