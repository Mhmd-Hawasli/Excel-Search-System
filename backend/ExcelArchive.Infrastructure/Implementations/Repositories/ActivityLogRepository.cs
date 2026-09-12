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
