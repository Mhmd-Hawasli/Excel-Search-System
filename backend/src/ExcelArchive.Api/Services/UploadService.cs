using System.Text.Json;
using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Upload;
using ExcelArchive.Api.Models.Entities;
using ExcelArchive.Api.Models.Enums;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Services;

public class UploadService(AppDbContext db, IActivityService activity) : IUploadService
{
    public async Task<CreateUploadJobResponse> CreateJobAsync(CreateUploadJobRequest request, string actorUsername, CancellationToken ct = default)
    {
        if (await db.Files.AnyAsync(f => f.Name == request.Name, ct))
            throw new InvalidOperationException("اسم الملف مستخدم بالفعل. اختر اسمًا آخر.");

        var payload = new
        {
            groupId = request.GroupId,
            name = request.Name,
            description = request.Description,
            originalFilename = request.OriginalFilename,
            sheetName = request.SheetName,
            totalRows = request.TotalRows,
            columnSignature = request.ColumnSignature,
            columns = request.Columns,
            mode = request.Mode,
            linkedSheets = request.LinkedSheets,
        };
        var job = new UploadJob
        {
            Status = UploadJobStatus.Pending,
            TotalRows = request.TotalRows,
            Payload = JsonSerializer.SerializeToDocument(payload),
        };
        db.UploadJobs.Add(job);
        await db.SaveChangesAsync(ct);

        // Background worker is intentionally registered in a later migration
        // pass; the job remains pollable and gives the UI real feedback.
        return new CreateUploadJobResponse(job.Id);
    }

    public async Task<UploadJobDto?> GetJobAsync(Guid id, CancellationToken ct = default)
    {
        var job = await db.UploadJobs.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        return job is null ? null : ToDto(job);
    }

    public async Task<SaveTemplateResponse> SaveTemplateAsync(Guid jobId, SaveTemplateRequest request, string actorUsername, CancellationToken ct = default)
    {
        var job = await db.UploadJobs.FirstOrDefaultAsync(x => x.Id == jobId, ct)
            ?? throw new KeyNotFoundException("مهمة الرفع غير موجودة.");
        if (job.Status != UploadJobStatus.Done) throw new InvalidOperationException("لا يمكن حفظ قالب قبل اكتمال الاستيراد.");

        var payload = job.Payload.RootElement;
        var groupId = payload.TryGetProperty("groupId", out var gid) && gid.TryGetGuid(out var guid) ? guid : Guid.Empty;
        var name = payload.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
        var signature = payload.TryGetProperty("columnSignature", out var sig) ? sig.GetString() ?? "" : "";

        db.MappingTemplates.Add(new MappingTemplate
        {
            GroupId = groupId,
            Name = request.Name,
            HeaderSignature = signature,
            Mapping = JsonSerializer.SerializeToDocument(new { columns = job.Payload.RootElement.GetRawText() }),
        });
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.TemplateCreated, request.Name, new { groupId, by = actorUsername }, ct);
        return new SaveTemplateResponse(true);
    }

    public async Task<IReadOnlyDictionary<string, object?>> InspectAsync(Stream stream, string fileName, CancellationToken ct = default)
    {
        var lower = fileName.ToLowerInvariant();
        if (!lower.EndsWith(".xlsx") && !lower.EndsWith(".xls"))
            throw new InvalidOperationException("الصيغ المقبولة هي XLSX وXLS فقط.");

        using var workbook = new ClosedXML.Excel.XLWorkbook(stream);
        var sheets = new List<object>();
        foreach (var ws in workbook.Worksheets)
        {
            var headers = new List<string>();
            for (var c = 1; c <= Math.Min(100, ws.LastColumnUsed()?.ColumnNumber() ?? 0); c++)
            {
                headers.Add(ws.Cell(1, c).GetString());
            }
            sheets.Add(new { name = ws.Name, columns = headers, rowCount = ws.LastRowUsed()?.RowNumber() ?? 0 });
        }
        return new Dictionary<string, object?>
        {
            ["sheetName"] = workbook.Worksheets.FirstOrDefault()?.Name ?? "",
            ["sheets"] = sheets,
        };
    }

    private static UploadJobDto ToDto(UploadJob j) =>
        new(j.Id, j.FileId, j.Status.ToString(), j.TotalRows, j.ProcessedRows, j.ErrorMessage, j.StartedAt, j.FinishedAt);
}
