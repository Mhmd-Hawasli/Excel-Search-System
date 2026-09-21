using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class RecordRepository(AppDbContext db) : RepositoryBase<Record>(db), IRecordRepository
{
    public Task<Record?> FindDetailAsync(Guid id, CancellationToken ct = default)
        => Db.Records.AsNoTracking()
            .Include(r => r.File).ThenInclude(f => f.Group)
            .Include(r => r.File).ThenInclude(f => f.Columns.OrderBy(c => c.SortOrder).ThenBy(c => c.ColumnIndex))
            .ThenInclude(c => c.Category)
            .FirstOrDefaultAsync(r => r.Id == id, ct);

    public Task<Record?> FindWithFileAsync(Guid id, CancellationToken ct = default)
        => Db.Records.Include(r => r.File).FirstOrDefaultAsync(r => r.Id == id, ct);

    public Task<Record?> FindReadOnlyAsync(Guid id, CancellationToken ct = default)
        => Db.Records.AsNoTracking().Include(r => r.File).FirstOrDefaultAsync(r => r.Id == id, ct);

    public Task<Record?> FindByFileAndRowAsync(Guid fileId, int rowIndex, CancellationToken ct = default)
        => Db.Records.AsNoTracking().FirstOrDefaultAsync(r => r.FileId == fileId && r.RowIndex == rowIndex, ct);

    public async Task<IReadOnlyList<Record>> ListPeopleByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default)
        => await Db.Records.AsNoTracking().Where(r => ids.Contains(r.Id)).ToListAsync(ct);

    public async Task<IReadOnlyList<int>> RowIndicesByNationalAsync(Guid fileId, long nationalNum, CancellationToken ct = default)
        => await Db.Records.AsNoTracking()
            .Where(r => r.FileId == fileId && r.NationalIdNum == nationalNum)
            .Select(r => r.RowIndex).ToListAsync(ct);

    public Task<int> CountByNationalAsync(Guid fileId, long nationalNum, CancellationToken ct = default)
        => Db.Records.CountAsync(r => r.FileId == fileId && r.NationalIdNum == nationalNum, ct);

    private static IQueryable<Record> Visible(IQueryable<Record> query, IReadOnlyList<Guid>? fileIds)
        => fileIds is null ? query : query.Where(r => fileIds.Contains(r.FileId));

    private static IQueryable<Record> WithGraph(IQueryable<Record> query)
        => query.Include(r => r.File).ThenInclude(f => f.Group);

    public async Task<IReadOnlyList<Record>> RelatedByNationalIdAsync(long nationalNum, Guid excludeId, IReadOnlyList<Guid>? fileIds, int take, CancellationToken ct = default)
        => await WithGraph(Visible(Db.Records.AsNoTracking(), fileIds))
            .Where(r => r.NationalIdNum == nationalNum && r.Id != excludeId)
            .OrderByDescending(r => r.CreatedAt).Take(take).ToListAsync(ct);

    public async Task<IReadOnlyList<Record>> RelatedByPersonAsync(string fullName, string motherName, Guid excludeId, IReadOnlyList<Guid>? fileIds, int take, CancellationToken ct = default)
        => await WithGraph(Visible(Db.Records.AsNoTracking(), fileIds))
            .Where(r => r.NFullName == fullName && r.NMotherName == motherName && r.Id != excludeId)
            .OrderByDescending(r => r.CreatedAt).Take(take).ToListAsync(ct);

    public async Task<IReadOnlyList<Record>> ConflictByNationalIdAsync(string fullName, long? nationalNum, Guid excludeId, IReadOnlyList<Guid>? fileIds, int take, CancellationToken ct = default)
        => await WithGraph(Visible(Db.Records.AsNoTracking(), fileIds))
            .Where(r => r.NFullName == fullName && r.NationalIdNum != nationalNum && r.Id != excludeId)
            .OrderByDescending(r => r.CreatedAt).Take(take).ToListAsync(ct);

    public async Task<IReadOnlyList<Record>> ConflictByMotherAsync(string fullName, string? motherName, Guid excludeId, IReadOnlyList<Guid>? fileIds, int take, CancellationToken ct = default)
        => await WithGraph(Visible(Db.Records.AsNoTracking(), fileIds))
            .Where(r => r.NFullName == fullName && r.NMotherName != motherName && r.Id != excludeId)
            .OrderByDescending(r => r.CreatedAt).Take(take).ToListAsync(ct);

    public async Task<IReadOnlyList<Record>> ListBatchesByFileAsync(Guid fileId, int? afterRow, int take, CancellationToken ct = default)
        => await Db.Records
            .Where(r => r.FileId == fileId && (!afterRow.HasValue || r.RowIndex > afterRow.Value))
            .OrderBy(r => r.RowIndex).Take(take).ToListAsync(ct);

    public async Task<IReadOnlyList<Record>> ListExportRowsAsync(Guid fileId, CancellationToken ct = default)
        => await Db.Records.AsNoTracking()
            .Where(r => r.FileId == fileId).OrderBy(r => r.RowIndex).ToListAsync(ct);

    public async Task<IReadOnlyList<Guid>> AllIdsAsync(CancellationToken ct = default)
        => await Db.Records.AsNoTracking().Select(r => r.Id).ToListAsync(ct);

    public async Task<int> GetMaxRowIndexAsync(Guid fileId, CancellationToken ct = default)
        => await Db.Records.AsNoTracking()
            .Where(r => r.FileId == fileId)
            .Select(r => (int?)r.RowIndex)
            .MaxAsync(ct) ?? 0;

    public Task<bool> ExistsNationalAsync(Guid fileId, string dNationalId, CancellationToken ct = default)
        => Db.Records.AsNoTracking()
            .AnyAsync(r => r.FileId == fileId && r.DNationalId == dNationalId, ct);

    public Task<bool> ExistsShamAsync(Guid fileId, long shamValue, CancellationToken ct = default)
        => Db.Records.AsNoTracking()
            .AnyAsync(r => r.FileId == fileId && r.SfShamCash == shamValue, ct);

    public Task<bool> ExistsPersonalAsync(Guid fileId, string dPersonalNo, CancellationToken ct = default)
        => Db.Records.AsNoTracking()
            .AnyAsync(r => r.FileId == fileId && r.DPersonalNo == dPersonalNo, ct);

    public Task<bool> ExistsPhoneAsync(Guid fileId, string dPhone, CancellationToken ct = default)
        => Db.Records.AsNoTracking()
            .AnyAsync(r => r.FileId == fileId && r.DPhone == dPhone, ct);

    public async Task<bool> ExistsRawAsync(Guid fileId, string headerRaw, string value, CancellationToken ct = default)
    {
        // Fallback for non-normalized duplicates (e.g. invalid sham-cash):
        // exact raw match on the same column inside the same file only.
        // SQL-side jsonb lookup on PostgreSQL (previously the ENTIRE file's
        // Data documents were loaded into memory and scanned in C# — OOM on
        // large files); portable client-side scan only for non-relational
        // providers (InMemory unit tests).
        if (Db.Database.IsNpgsql())
        {
            var hit = await Db.Database.SqlQueryRaw<int>(
                "SELECT 1 AS \"Value\" FROM \"records\" WHERE \"file_id\" = {0} AND (\"data\" ->> {1}) = {2} LIMIT 1",
                fileId, headerRaw, value).ToListAsync(ct);
            return hit.Count > 0;
        }
        var rows = await Db.Records.AsNoTracking()
            .Where(r => r.FileId == fileId)
            .Select(r => r.Data)
            .ToListAsync(ct);
        foreach (var doc in rows)
        {
            if (doc is null || doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object) continue;
            if (!doc.RootElement.TryGetProperty(headerRaw, out var prop)) continue;
            var stored = prop.ValueKind == System.Text.Json.JsonValueKind.String
                ? prop.GetString() ?? ""
                : prop.ValueKind is System.Text.Json.JsonValueKind.Null or System.Text.Json.JsonValueKind.Undefined
                    ? "" : prop.GetRawText();
            if (string.Equals(stored, value, StringComparison.Ordinal)) return true;
        }
        return false;
    }

    public async Task<IReadOnlyList<string>> ListDistinctValuesAsync(Guid fileId, string headerRaw, int take, CancellationToken ct = default)
    {
        var limit = Math.Clamp(take, 1, 200);
        // SQL-side distinct+count over jsonb on PostgreSQL (previously: whole
        // file materialized + grouped in memory). Ordered by frequency desc.
        if (Db.Database.IsNpgsql())
        {
            return await Db.Database.SqlQueryRaw<string>(
                "SELECT v AS \"Value\" FROM (SELECT TRIM(\"data\" ->> {1}) AS v, COUNT(*) AS c FROM \"records\" " +
                "WHERE \"file_id\" = {0} AND NULLIF(TRIM(\"data\" ->> {1}), '') IS NOT NULL " +
                "GROUP BY TRIM(\"data\" ->> {1})) s ORDER BY c DESC, v LIMIT {2}",
                fileId, headerRaw, limit).ToListAsync(ct);
        }
        var docs = await Db.Records.AsNoTracking()
            .Where(r => r.FileId == fileId)
            .Select(r => r.Data)
            .ToListAsync(ct);
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var doc in docs)
        {
            if (doc is null || doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object) continue;
            if (!doc.RootElement.TryGetProperty(headerRaw, out var prop)) continue;
            var stored = prop.ValueKind == System.Text.Json.JsonValueKind.String
                ? (prop.GetString() ?? "").Trim()
                : prop.ValueKind is System.Text.Json.JsonValueKind.Null or System.Text.Json.JsonValueKind.Undefined
                    ? "" : prop.GetRawText().Trim();
            if (stored.Length == 0) continue;
            counts[stored] = counts.TryGetValue(stored, out var c) ? c + 1 : 1;
        }
        return counts.OrderByDescending(kv => kv.Value).ThenBy(kv => kv.Key, StringComparer.Ordinal)
            .Take(limit)
            .Select(kv => kv.Key)
            .ToList();
    }
}
