using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Auth;
using ExcelArchive.Api.DTOs.Conflicts;
using ExcelArchive.Api.Services.Abstractions;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Services;

public class ConflictService(AppDbContext db) : IConflictService
{
    public async Task<ConflictsResult> ListAsync(ConflictQueryRequest request, DataScopeDto scope, CancellationToken ct = default)
    {
        var query = db.Records.AsNoTracking()
            .Include(r => r.File).ThenInclude(f => f.Group)
            .AsQueryable();

        if (scope.GroupIds is not null) query = query.Where(r => scope.GroupIds.Contains(r.File.GroupId));
        if (scope.FileIds is not null) query = query.Where(r => scope.FileIds.Contains(r.FileId));
        if (request.GroupIds is { Count: > 0 }) query = query.Where(r => request.GroupIds.Contains(r.File.GroupId));
        if (request.FileIds is { Count: > 0 }) query = query.Where(r => request.FileIds.Contains(r.FileId));

        var rows = new List<ConflictRow>();
        var rule = request.Rule?.Trim().ToLowerInvariant() ?? "all";

        if (rule is "all" or "invalid_national_id" or "missing_national_id")
        {
            var candidates = await query
                .Where(r => r.SfNationalId != null && (r.SfNationalId < 100_000_000 || r.SfNationalId > 99_999_999_999))
                .OrderBy(r => r.File.Name).ThenBy(r => r.RowIndex)
                .Take(5000).ToListAsync(ct);
            rows.AddRange(candidates.Select(r => ToRow(r, "invalid_national_id",
                "طول الرقم الوطني غير صالح (يجب أن يكون 9–11 رقمًا).")));
        }

        if (rule is "all" or "missing_national_id")
        {
            var candidates = await query
                .Where(r => r.SfNationalId == null)
                .OrderBy(r => r.File.Name).ThenBy(r => r.RowIndex)
                .Take(5000).ToListAsync(ct);
            rows.AddRange(candidates.Select(r => ToRow(r, "missing_national_id", "الرقم الوطني مفقود.")));
        }

        if (rule is "all" or "duplicate_national_id")
        {
            var duplicates = await query
                .Where(r => r.NationalIdNum != null)
                .GroupBy(r => r.NationalIdNum)
                .Where(g => g.Count() > 1)
                .Select(g => g.Key)
                .ToListAsync(ct);
            if (duplicates.Count > 0)
            {
                var dupRows = await query.Where(r => r.NationalIdNum != null && duplicates.Contains(r.NationalIdNum))
                    .OrderBy(r => r.File.Name).ThenBy(r => r.RowIndex)
                    .Take(5000).ToListAsync(ct);
                rows.AddRange(dupRows.Select(r => ToRow(r, "duplicate_national_id", "الرقم الوطني مكرر في أكثر من ملف.")));
            }
        }

        if (rule is "all" or "invalid_phone")
        {
            var candidates = await query
                .Where(r => r.SfPhone != null && !r.SfPhone.All(char.IsDigit))
                .OrderBy(r => r.File.Name).ThenBy(r => r.RowIndex)
                .Take(5000).ToListAsync(ct);
            rows.AddRange(candidates.Select(r => ToRow(r, "invalid_phone", "رقم الهاتف يحتوي على محارف غير رقمية.")));
        }

        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 200);
        return new ConflictsResult(
            rows.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
            rows.Count, page, pageSize, DateTime.UtcNow);
    }

    public async Task IgnoreAsync(string rule, Guid recordId, CancellationToken ct = default)
    {
        if (await db.IgnoredConflicts.AnyAsync(i => i.Rule == rule && i.RecordId == recordId, ct)) return;
        db.IgnoredConflicts.Add(new Models.Entities.IgnoredConflict { Rule = rule, RecordId = recordId });
        await db.SaveChangesAsync(ct);
    }

    public async Task<byte[]> ExportAsync(ConflictQueryRequest request, DataScopeDto scope, CancellationToken ct = default)
    {
        var result = await ListAsync(request with { Page = 1, PageSize = 20_000 }, scope, ct);
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("تضارب البيانات");
        sheet.Cell(1, 1).Value = "الملف";
        sheet.Cell(1, 2).Value = "الصف";
        sheet.Cell(1, 3).Value = "الاسم";
        sheet.Cell(1, 4).Value = "الرقم الوطني";
        sheet.Cell(1, 5).Value = "القاعدة";
        sheet.Cell(1, 6).Value = "الوصف";
        var row = 2;
        foreach (var item in result.Rows)
        {
            sheet.Cell(row, 1).Value = item.FileName;
            sheet.Cell(row, 2).Value = item.RowIndex;
            sheet.Cell(row, 3).Value = item.FullName ?? "";
            sheet.Cell(row, 4).Value = item.NationalId ?? "";
            sheet.Cell(row, 5).Value = item.Rule;
            sheet.Cell(row, 6).Value = item.Description;
            row++;
        }
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static ConflictRow ToRow(Models.Entities.Record r, string rule, string description) =>
        new(r.Id, r.FileId, r.File.Name, r.File.GroupId, r.File.Group.Name, r.RowIndex,
            r.SfFullName, r.SfMotherName, r.DNationalId, [], rule, description);
}
