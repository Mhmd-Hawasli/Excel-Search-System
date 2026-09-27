using System.Globalization;
using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class RecordEditRepository(AppDbContext db) : RepositoryBase<RecordEdit>(db), IRecordEditRepository
{
    public async Task<IReadOnlyList<(Guid FileId, int Count, DateTime Last)>> SummaryAsync(IReadOnlyList<Guid>? fileIds, CancellationToken ct = default)
    {
        var query = Db.RecordEdits.AsNoTracking().AsQueryable();
        if (fileIds is not null) query = query.Where(e => fileIds.Contains(e.FileId));
        var rows = await query
            .GroupBy(e => new { e.FileId })
            .Select(g => new { g.Key.FileId, Count = g.Count(), Last = g.Max(x => x.CreatedAt) })
            .ToListAsync(ct);
        return rows.Select(r => (r.FileId, r.Count, r.Last)).ToList();
    }

    public async Task<(IReadOnlyList<RecordEdit> Rows, int Total, int Manual, int Upload, int Formatting)> ListPagedAsync(Guid? fileId, IReadOnlyList<Guid>? fileIds, int page, int pageSize,
        string? person, string? column, string? oldValue, string? newValue,
        int? version, string? fromDate, string? toDate, string? user,
        string? sortBy, string? sortDir, IReadOnlyList<string>? columns,
        IReadOnlyList<string>? users, string? source, CancellationToken ct = default)
    {
        var query = Db.RecordEdits.AsNoTracking().AsQueryable();
        if (fileId is not null) query = query.Where(e => e.FileId == fileId);
        else if (fileIds is not null) query = query.Where(e => fileIds.Contains(e.FileId));

        // Filter by person name (join with Records)
        if (!string.IsNullOrWhiteSpace(person))
        {
            var personLower = person.ToLower();
            query = query.Where(e => e.Record != null && (
                (e.Record.SfFullName != null && e.Record.SfFullName.ToLower().Contains(personLower)) ||
                (e.Record.SfFirstName != null && e.Record.SfFirstName.ToLower().Contains(personLower)) ||
                (e.Record.SfFatherName != null && e.Record.SfFatherName.ToLower().Contains(personLower)) ||
                (e.Record.SfLastName != null && e.Record.SfLastName.ToLower().Contains(personLower))
            ));
        }

        // Filter by column header
        if (!string.IsNullOrWhiteSpace(column))
        {
            var colLower = column.ToLower();
            query = query.Where(e => e.HeaderRaw.ToLower().Contains(colLower));
        }

        // Multi-select: exact column match (new smart filter; the single
        // contains-filter above stays for backward compatibility).
        if (columns is not null && columns.Count > 0)
        {
            var set = columns.Where(c => !string.IsNullOrWhiteSpace(c)).Distinct().ToList();
            if (set.Count > 0)
                query = query.Where(e => set.Contains(e.HeaderRaw));
        }

        // Filter by old value
        if (!string.IsNullOrWhiteSpace(oldValue))
        {
            var oldLower = oldValue.ToLower();
            query = query.Where(e => e.OldValue.ToLower().Contains(oldLower));
        }

        // Filter by new value
        if (!string.IsNullOrWhiteSpace(newValue))
        {
            var newLower = newValue.ToLower();
            query = query.Where(e => e.NewValue.ToLower().Contains(newLower));
        }

        // Filter by version
        if (version.HasValue)
        {
            query = query.Where(e => e.FileVersion == version.Value);
        }

        // Filter by date range
        var fromBoundary = ParseDateBoundary(fromDate, upper: false);
        if (fromBoundary.HasValue)
        {
            var fromUtc = fromBoundary.Value.Value;
            query = query.Where(e => e.CreatedAt >= fromUtc);
        }
        var toBoundary = ParseDateBoundary(toDate, upper: true);
        if (toBoundary.HasValue)
        {
            var toUtc = toBoundary.Value.Value;
            query = toBoundary.Value.Exclusive
                ? query.Where(e => e.CreatedAt < toUtc)
                : query.Where(e => e.CreatedAt <= toUtc);
        }

        // Filter by user
        if (!string.IsNullOrWhiteSpace(user))
        {
            var userLower = user.ToLower();
            query = query.Where(e => e.EditedBy != null && e.EditedBy.ToLower().Contains(userLower));
        }

        // Multi-select: exact user match (new smart filter).
        if (users is not null && users.Count > 0)
        {
            var set = users.Where(u => !string.IsNullOrWhiteSpace(u)).Distinct().ToList();
            if (set.Count > 0)
                query = query.Where(e => e.EditedBy != null && set.Contains(e.EditedBy));
        }

        // Counts describe the selected stage/version and other filters before
        // narrowing to one source, so the user can switch sources without
        // losing the context of the other two totals.
        var counts = await query.GroupBy(e => new { e.IsBulk, e.IsFormatting })
            .Select(g => new { g.Key.IsBulk, g.Key.IsFormatting, Count = g.Count() })
            .ToListAsync(ct);
        var manual = counts.Where(c => !c.IsBulk).Sum(c => c.Count);
        var upload = counts.Where(c => c.IsBulk && !c.IsFormatting).Sum(c => c.Count);
        var formatting = counts.Where(c => c.IsBulk && c.IsFormatting).Sum(c => c.Count);
        query = source switch
        {
            "manual" => query.Where(e => !e.IsBulk),
            "upload" => query.Where(e => e.IsBulk && !e.IsFormatting),
            "formatting" => query.Where(e => e.IsBulk && e.IsFormatting),
            _ => query,
        };

        // Sorting
        query = sortBy?.ToLower() switch
        {
            "person" => sortDir == "asc"
                ? query.OrderBy(e => e.Record == null ? null : e.Record.SfFullName)
                : query.OrderByDescending(e => e.Record == null ? null : e.Record.SfFullName),
            "column" => sortDir == "asc" ? query.OrderBy(e => e.HeaderRaw) : query.OrderByDescending(e => e.HeaderRaw),
            "oldvalue" => sortDir == "asc" ? query.OrderBy(e => e.OldValue) : query.OrderByDescending(e => e.OldValue),
            "newvalue" => sortDir == "asc" ? query.OrderBy(e => e.NewValue) : query.OrderByDescending(e => e.NewValue),
            "version" => sortDir == "asc" ? query.OrderBy(e => e.FileVersion) : query.OrderByDescending(e => e.FileVersion),
            "date" => sortDir == "asc" ? query.OrderBy(e => e.CreatedAt) : query.OrderByDescending(e => e.CreatedAt),
            "user" => sortDir == "asc" ? query.OrderBy(e => e.EditedBy) : query.OrderByDescending(e => e.EditedBy),
            _ => query.OrderByDescending(e => e.CreatedAt)
        };

        var total = await query.CountAsync(ct);
        var rows = await query
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return (rows, total, manual, upload, formatting);
    }

    private static (DateTime Value, bool Exclusive)? ParseDateBoundary(string? raw, bool upper)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (DateOnly.TryParseExact(raw, "yyyy-MM-dd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var day))
        {
            if (upper && day == DateOnly.MaxValue)
                return (DateTime.SpecifyKind(DateTime.MaxValue, DateTimeKind.Utc), false);
            return (upper ? day.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)
                : day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc), upper);
        }
        return DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var timestamp)
            ? (timestamp.UtcDateTime, false) : null;
    }

    public async Task<IReadOnlyList<RecordEdit>> ListByRecordAsync(Guid recordId, CancellationToken ct = default)
        => await Db.RecordEdits.AsNoTracking()
            .Where(e => e.RecordId == recordId)
            .OrderByDescending(e => e.CreatedAt)
            .ToListAsync(ct);

    public Task<RecordEdit?> LatestByRecordAndHeaderAsync(Guid recordId, string headerRaw, CancellationToken ct = default)
        => Db.RecordEdits.AsNoTracking()
            .Where(e => e.RecordId == recordId && e.HeaderRaw == headerRaw)
            .OrderByDescending(e => e.CreatedAt)
            .FirstOrDefaultAsync(ct);

    public Task<int> CountByRecordAsync(Guid recordId, CancellationToken ct = default)
        => Db.RecordEdits.CountAsync(e => e.RecordId == recordId, ct);

    public Task<long> CountByFileAsync(Guid fileId, CancellationToken ct = default)
        => Db.RecordEdits.LongCountAsync(e => e.FileId == fileId, ct);

    public async Task<IReadOnlyList<Guid>> EditedFileIdsAsync(IReadOnlyList<Guid> fileIds, CancellationToken ct = default)
        => await Db.RecordEdits.AsNoTracking()
            .Where(e => fileIds.Contains(e.FileId))
            .Select(e => e.FileId)
            .Distinct()
            .ToListAsync(ct);

    public async Task<IReadOnlyList<RecordEdit>> ListByFileAsync(Guid fileId, CancellationToken ct = default)
        => await Db.RecordEdits.AsNoTracking()
            .Where(e => e.FileId == fileId).OrderBy(e => e.CreatedAt).ToListAsync(ct);

    public async Task<Dictionary<int, long>> CountByVersionAsync(Guid fileId, CancellationToken ct = default)
        => await Db.RecordEdits.AsNoTracking()
            .Where(e => e.FileId == fileId)
            .GroupBy(e => e.FileVersion)
            .Select(g => new { Version = g.Key, Count = (long)g.Count() })
            .ToDictionaryAsync(x => x.Version, x => x.Count, ct);

    public Task<long> CountPendingAsync(Guid fileId, CancellationToken ct = default)
        => Db.RecordEdits.LongCountAsync(e => e.FileId == fileId && e.RecordId != null && !e.IsBulk, ct);

    public async Task<IReadOnlyList<string>> DistinctHeadersAsync(Guid fileId, CancellationToken ct = default)
        => await Db.RecordEdits.AsNoTracking()
            .Where(e => e.FileId == fileId)
            .Select(e => e.HeaderRaw)
            .Distinct()
            .OrderBy(h => h)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<string>> DistinctEditorsAsync(Guid fileId, CancellationToken ct = default)
        => await Db.RecordEdits.AsNoTracking()
            .Where(e => e.FileId == fileId && e.EditedBy != null)
            .Select(e => e.EditedBy!)
            .Distinct()
            .OrderBy(u => u)
            .ToListAsync(ct);
}
