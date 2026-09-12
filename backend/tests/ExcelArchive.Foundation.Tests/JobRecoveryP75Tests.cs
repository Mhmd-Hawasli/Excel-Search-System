using ExcelArchive.Infrastructure.Implementations.Repositories;
using System.Text.Json;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P7.5: restart recovery — jobs stuck in PARSING/INSERTING by a
/// crash are re-queued to PENDING exactly once; terminal jobs untouched.</summary>
public sealed class JobRecoveryP75Tests
{
    [Fact]
    public async Task RecoverInterruptedJobs_RequeuesActive_LeavesTerminal()
    {
        var db = TestHelpers.InMemoryDb();
        db.UploadJobs.AddRange(
            new UploadJob { Status = UploadJobStatus.Parsing, Payload = JsonDocument.Parse("{}"), TotalRows = 1 },
            new UploadJob { Status = UploadJobStatus.Inserting, Payload = JsonDocument.Parse("{}"), TotalRows = 1 },
            new UploadJob { Status = UploadJobStatus.Pending, Payload = JsonDocument.Parse("{}"), TotalRows = 1 },
            new UploadJob { Status = UploadJobStatus.Done, Payload = JsonDocument.Parse("{}"), TotalRows = 1 },
            new UploadJob { Status = UploadJobStatus.Failed, Payload = JsonDocument.Parse("{}"), TotalRows = 1 });
        await db.SaveChangesAsync();

        var recovered = await new UploadJobRepository(db).RecoverStuckAsync(CancellationToken.None);

        Assert.Equal(2, recovered);
        Assert.Equal(3, await db.UploadJobs.CountAsync(j => j.Status == UploadJobStatus.Pending));
        Assert.Equal(1, await db.UploadJobs.CountAsync(j => j.Status == UploadJobStatus.Done));
        Assert.Equal(1, await db.UploadJobs.CountAsync(j => j.Status == UploadJobStatus.Failed));
        Assert.Equal(2, await db.UploadJobs.CountAsync(j =>
            j.Status == UploadJobStatus.Pending && j.ErrorMessage != null));
    }

    [Fact]
    public async Task RecoverInterruptedJobs_EmptyDb_NoOp()
    {
        var db = TestHelpers.InMemoryDb();
        Assert.Equal(0, await new UploadJobRepository(db).RecoverStuckAsync(CancellationToken.None));
    }
}
