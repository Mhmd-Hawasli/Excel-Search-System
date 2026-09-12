using System.Text.Json;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Application.Services;

public class UploadService(
    IUnitOfWork uow,
    IActivityService activity,
    IHeaderMappingValidator headers) : IUploadService
{
    public async Task<CreateUploadJobResponse> CreateJobAsync(CreateUploadJobRequest request, string actorUsername, CancellationToken ct = default)
    {
        var name = request.Name?.Trim() ?? "";
        if (name.Length < 2 || name.Length > 160)
            throw new InvalidDataException("إعدادات الاستيراد غير مكتملة. راجع خطوات المعالج.");
        if (string.IsNullOrWhiteSpace(request.OriginalFilename) || request.OriginalFilename.Length > 255
            || string.IsNullOrWhiteSpace(request.SheetName) || request.SheetName.Length > 255
            || request.SheetIndex < 1 || request.TotalRows < 0
            || (request.Description?.Trim().Length ?? 0) > 1000)
            throw new InvalidDataException("إعدادات الاستيراد غير مكتملة. راجع خطوات المعالج.");
        if (await uow.Files.NameExistsAsync(name, ct))
            throw new InvalidOperationException("اسم الملف مستخدم بالفعل. اختر اسمًا آخر.");
        if (await uow.Groups.FindAsync(request.GroupId, ct) is null)
            throw new KeyNotFoundException("المجموعة المحددة غير موجودة.");
        if (request.Columns is null || request.Columns.Count == 0)
            throw new InvalidDataException("إعدادات الاستيراد غير مكتملة. راجع خطوات المعالج.");

        var seen = new HashSet<StandardField>();
        foreach (var c in request.Columns)
        {
            if (string.IsNullOrWhiteSpace(c.HeaderRaw)) throw new InvalidDataException("إعدادات الاستيراد غير مكتملة. راجع خطوات المعالج.");
            if (c.ColumnIndex < 1) throw new InvalidDataException("إعدادات الاستيراد غير مكتملة. راجع خطوات المعالج.");
            if (!string.IsNullOrWhiteSpace(c.StandardField))
            {
                var f = StandardFieldKeys.Parse(c.StandardField)
                    ?? throw new InvalidDataException("إعدادات الاستيراد غير مكتملة. راجع خطوات المعالج.");
                if (!seen.Add(f)) throw new InvalidOperationException("لا يمكن ربط حقل قياسي واحد بأكثر من عمود.");
            }
        }

        var inspected = request.Columns.Select(c => new InspectedColumn(
            c.HeaderRaw, string.IsNullOrWhiteSpace(c.HeaderNormalized) ? ArabicNormalizer.NormalizeStored(c.HeaderRaw) : c.HeaderNormalized,
            c.ColumnIndex, string.IsNullOrWhiteSpace(c.StandardField) ? null : c.StandardField.Trim(), null)).ToList();
        if (request.LinkedSheets is not null)
        {
            if (request.LinkedSheets.SheetNames.Count == 0
                || request.LinkedSheets.SheetNames.Distinct(StringComparer.Ordinal).Count() != request.LinkedSheets.SheetNames.Count
                || request.LinkedSheets.NationalIdColumnIndex < 1)
                throw new InvalidDataException("إعدادات الاستيراد غير مكتملة. راجع خطوات المعالج.");
            var linkingError = headers.LinkedMappingError(
                request.SheetName, request.SheetIndex,
                request.LinkedSheets.SheetNames, request.LinkedSheets.NationalIdColumnIndex, inspected);
            if (linkingError is not null) throw new InvalidDataException(linkingError);
        }

        var categoryIds = request.Columns.Select(c => c.CategoryId).Where(g => g.HasValue).Select(g => g!.Value).Distinct().ToList();
        if (categoryIds.Count > 0
            && await uow.Categories.CountAsync(c => categoryIds.Contains(c.Id), ct) != categoryIds.Count)
            throw new InvalidDataException("توجد فئة محددة لم تعد متاحة.");

        var payload = new
        {
            groupId = request.GroupId, name, description = request.Description ?? "",
            originalFilename = request.OriginalFilename ?? "", sheetName = request.SheetName ?? "",
            sheetIndex = request.SheetIndex, totalRows = request.TotalRows,
            columnSignature = request.ColumnSignature ?? "",
            columns = request.Columns, mode = request.Mode ?? "single",
            linkedSheets = request.LinkedSheets, token = request.Token,
        };
        var job = new UploadJob
        {
            Status = UploadJobStatus.Pending,
            TotalRows = Math.Max(0, request.TotalRows),
            // camelCase: the background worker parses these exact keys (UploadJobConfig).
            Payload = JsonSerializer.SerializeToDocument(payload,
                new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }),
            StartedAt = DateTime.UtcNow,
        };
        uow.UploadJobs.Add(job);
        await uow.SaveChangesAsync(ct);
        // UploadBackgroundService picks up Pending jobs within seconds.
        return new CreateUploadJobResponse(job.Id);
    }

    public async Task<UploadJobDto?> GetJobAsync(Guid id, CancellationToken ct = default)
    {
        var job = await uow.UploadJobs.FindAsync(id, ct);
        return job is null ? null : ToDto(job);
    }

    public async Task<SaveTemplateResponse> SaveTemplateAsync(Guid jobId, SaveTemplateRequest request, string actorUsername, CancellationToken ct = default)
    {
        var tname = request.Name?.Trim() ?? "";
        if (tname.Length < 2 || tname.Length > 120)
            throw new InvalidDataException("أدخل اسمًا واضحًا للقالب.");
        var job = await uow.UploadJobs.FindAsync(jobId, ct)
            ?? throw new KeyNotFoundException("مهمة الرفع غير موجودة.");
        if (job.Status != UploadJobStatus.Done) throw new InvalidDataException("لا يمكن حفظ قالب قبل اكتمال الاستيراد.");
        var payload = job.Payload.RootElement;
        if (!payload.TryGetProperty("groupId", out var gid) || !gid.TryGetGuid(out var groupId))
            throw new InvalidDataException("لا يمكن حفظ قالب قبل اكتمال الاستيراد.");
        var signature = payload.TryGetProperty("columnSignature", out var sig) ? sig.GetString() ?? "" : "";
        if (!payload.TryGetProperty("columns", out var columns) || columns.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("لا يمكن حفظ قالب قبل اكتمال الاستيراد.");
        if (await uow.MappingTemplates.ExistsAsync(groupId, tname, ct))
            throw new InvalidOperationException("يوجد قالب بهذا الاسم داخل المجموعة.");
        uow.MappingTemplates.Add(new MappingTemplate
        {
            GroupId = groupId, Name = tname, HeaderSignature = signature,
            Mapping = JsonSerializer.SerializeToDocument(new { columns }),
        });
        await uow.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.TemplateCreated, tname, new { groupId, by = actorUsername }, ct);
        return new SaveTemplateResponse(true);
    }

    internal static UploadJobDto ToDto(UploadJob j) =>
        new(j.Id, j.FileId, j.Status.ToString().ToUpperInvariant(), j.TotalRows, j.ProcessedRows, j.ErrorMessage, j.StartedAt, j.FinishedAt);

    public async Task<IReadOnlyList<MappingTemplateDto>> ListTemplatesAsync(Guid? groupId, DataScopeDto scope, CancellationToken ct = default)
    {
        var rows = groupId.HasValue
            ? await uow.MappingTemplates.ListByGroupAsync(groupId.Value, ct)
            : await uow.MappingTemplates.ListAsync(ct);
        if (scope.GroupIds is not null)
            rows = rows.Where(t => scope.GroupIds.Contains(t.GroupId)).ToList();
        return rows.Select(t => new MappingTemplateDto(t.Id, t.GroupId, t.Name, t.Mapping)).ToList();
    }
}
