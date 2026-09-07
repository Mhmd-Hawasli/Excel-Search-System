using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Auth;
using ExcelArchive.Api.DTOs.Edits;
using ExcelArchive.Api.Models.Enums;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Services;

public class EditsService(AppDbContext db, IActivityService activity) : IEditsService
{
    public async Task<IReadOnlyList<EditedFileSummary>> SummaryAsync(DataScopeDto scope, CancellationToken ct = default)
    {
        var query = db.RecordEdits.AsNoTracking().AsQueryable();
        if (scope.FileIds is not null) query = query.Where(e => scope.FileIds.Contains(e.FileId));

        var rows = await query
            .GroupBy(e => new { e.FileId })
            .Select(g => new { g.Key.FileId, Count = g.Count(), Last = g.Max(x => x.CreatedAt) })
            .ToListAsync(ct);

        var fileIds = rows.Select(r => r.FileId).ToList();
        var files = await db.Files.AsNoTracking().Include(f => f.Group)
            .Where(f => fileIds.Contains(f.Id)).ToListAsync(ct);
        return rows.Select(r =>
        {
            var file = files.FirstOrDefault(f => f.Id == r.FileId);
            return new EditedFileSummary(r.FileId, file?.Name ?? "", file?.GroupId ?? Guid.Empty,
                file?.Group.Name ?? "", r.Count, r.Last);
        }).ToList();
    }

    public async Task<EditsResult> ListAsync(Guid? fileId, DataScopeDto scope, int page, int pageSize, CancellationToken ct = default)
    {
        var query = db.RecordEdits.AsNoTracking().AsQueryable();
        if (fileId is not null) query = query.Where(e => e.FileId == fileId);
        else if (scope.FileIds is not null) query = query.Where(e => scope.FileIds.Contains(e.FileId));

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(e => e.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return new EditsResult(rows.Select(e => new EditDto(e.Id, e.RecordId, e.FileId, e.FileColumnId,
            e.HeaderRaw, e.OldValue, e.NewValue, e.CreatedAt)).ToList(), total, page, pageSize);
    }

    public async Task RevertAsync(Guid editId, string newValue, string actorUsername, CancellationToken ct = default)
    {
        var edit = await db.RecordEdits.FirstOrDefaultAsync(e => e.Id == editId)
            ?? throw new KeyNotFoundException("غير موجود.");
        var record = await db.Records.FirstOrDefaultAsync(r => r.Id == edit.RecordId)
            ?? throw new KeyNotFoundException("غير موجود.");

        var data = record.Data.RootElement;
        if (data.ValueKind == System.Text.Json.JsonValueKind.Object)
        {
            using var doc = System.Text.Json.JsonDocument.Parse(record.Data.RootElement.GetRawText());
            var dict = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, object?>>(doc.RootElement.GetRawText())
                ?? new Dictionary<string, object?>();
            dict[edit.HeaderRaw] = newValue;
            record.Data = System.Text.Json.JsonSerializer.SerializeToDocument(dict);
        }
        db.RecordEdits.Add(new Models.Entities.RecordEdit
        {
            RecordId = edit.RecordId,
            FileId = edit.FileId,
            FileColumnId = edit.FileColumnId,
            HeaderRaw = edit.HeaderRaw,
            OldValue = edit.NewValue,
            NewValue = newValue,
        });
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.RecordEdited, record.RowIndex.ToString(),
            new { header = edit.HeaderRaw, by = actorUsername }, ct);
    }

    public async Task VisitAsync(Guid recordId, string actorUsername, CancellationToken ct = default)
    {
        var record = await db.Records.FirstOrDefaultAsync(r => r.Id == recordId)
            ?? throw new KeyNotFoundException("غير موجود.");
        await activity.WriteAsync(ActivityAction.RecordVisited, record.RowIndex.ToString(),
            new { recordId, by = actorUsername }, ct);
    }
}
