using ExcelArchive.Infrastructure.Implementations.Persistence;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;

using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Repositories;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;


public class ActivityLogRepository(AppDbContext db) : RepositoryBase<ActivityLog>(db), IActivityLogRepository
{
    public async Task<IReadOnlyList<ActivityLog>> ListByActionAsync(ActivityAction action, string targetName, CancellationToken ct = default)
        => await Db.ActivityLogs
            .Where(a => a.Action == action && a.TargetName == targetName)
            .ToListAsync(ct);

    public async Task<bool> ExistsRecentVisitAsync(Guid recordId, string visitorUsername, DateTime cutoff, CancellationToken ct = default)
    {
        // Portable pre-filter on indexed/translatable columns (action + time
        // + target), then exact JSON match client-side over a tiny window so
        // both PostgreSQL and the InMemory test provider behave identically.
        var rid = recordId.ToString();
        var candidates = await Db.ActivityLogs.AsNoTracking()
            .Where(a => a.Action == ActivityAction.RecordVisited && a.CreatedAt >= cutoff)
            .Select(a => a.Details)
            .ToListAsync(ct);
        foreach (var doc in candidates)
        {
            if (doc is null || doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object) continue;
            var root = doc.RootElement;
            if (!root.TryGetProperty("recordId", out var idProp)) continue;
            var storedId = idProp.ValueKind == System.Text.Json.JsonValueKind.String ? idProp.GetString() : null;
            if (!string.Equals(storedId, rid, StringComparison.OrdinalIgnoreCase)) continue;
            if (root.TryGetProperty("visitorUsername", out var userProp)
                && userProp.ValueKind == System.Text.Json.JsonValueKind.String
                && string.Equals(userProp.GetString(), visitorUsername, StringComparison.Ordinal))
                return true;
        }
        return false;
    }

    public async Task<(IReadOnlyList<ActivityLog> Rows, int Total)> SearchAsync(
        ActivityAction? action, string? search, ActivityAction? searchedAction,
        int page, int pageSize, CancellationToken ct = default)
    {
        var query = Db.ActivityLogs.AsNoTracking();
        if (action.HasValue)
            query = query.Where(x => x.Action == action.Value);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = searchedAction.HasValue
                ? query.Where(x => x.TargetName.Contains(term) || x.Action == searchedAction.Value)
                : query.Where(x => x.TargetName.Contains(term));
        }
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);
        return (rows, total);
    }
}
