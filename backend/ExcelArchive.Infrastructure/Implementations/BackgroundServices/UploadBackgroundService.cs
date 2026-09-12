using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ExcelArchive.Infrastructure.Implementations.BackgroundServices;

/// <summary>
/// Background import pipeline host: polls for pending jobs, owns the atomic
/// claim, crash recovery and cancellation/logging. Job execution itself is the
/// scoped <see cref="IUploadJobProcessor"/> in Application.
/// </summary>
public class UploadBackgroundService(
    IServiceProvider services,
    ILogger<UploadBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        // Crash recovery: jobs stuck in PARSING/INSERTING by a previous
        // crash/restart never get claimed (ProcessOne only takes PENDING).
        // Re-queue them once so durable inputs retry; inputs already pruned
        // fail fast with the expired-token message instead of hanging.
        try
        {
            using var scope = services.CreateScope();
            var jobs = scope.ServiceProvider.GetRequiredService<IUploadJobRepository>();
            var recovered = await jobs.RecoverStuckAsync(stoppingToken);
            if (recovered > 0)
                logger.LogWarning("Re-queued {Count} interrupted upload jobs after restart", recovered);
        }
        catch (Exception ex) { logger.LogError(ex, "Upload worker restart recovery failed"); }
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = services.CreateScope();
                await ProcessOneAsync(scope, stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { logger.LogError(ex, "Upload worker iteration failed"); }
            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }

    private async Task ProcessOneAsync(IServiceScope scope, CancellationToken ct)
    {
        var sp = scope.ServiceProvider;
        var jobs = sp.GetRequiredService<IUploadJobRepository>();
        var id = await jobs.TryClaimPendingAsync(ct);
        if (id is null) return;

        try
        {
            var processor = sp.GetRequiredService<IUploadJobProcessor>();
            await processor.ProcessAsync(id.Value, ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Import job {JobId} failed", id.Value);
            await jobs.FailAsync(id.Value, ex.Message, ct);
        }
    }
}
