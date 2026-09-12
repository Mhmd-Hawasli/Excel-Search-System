using System.Text.Json;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Interfaces.Storage;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Records;
using ExcelArchive.Domain.Text;
using FileEntity = ExcelArchive.Domain.Entities.File;

namespace ExcelArchive.Application.Services;

/// <summary>
/// Scoped execution of one upload job: validation, import batches with shadow/
/// quality rebuild, replacement promotion, failure cleanup. Claiming, hosting
/// and cancellation stay in the background worker.
/// </summary>
public class UploadJobProcessor(
    IUnitOfWork uow,
    IActivityService activity,
    IColumnOrderService columns,
    IHeaderMappingValidator headers,
    IWorkbookReader reader,
    IWorkbookFileStore files) : IUploadJobProcessor
{
    private const int BatchSize = 1000;

    public async Task ProcessAsync(Guid jobId, CancellationToken ct = default)
    {
        var job = await uow.UploadJobs.FindAsync(jobId, ct);
        if (job is null) return;
        try
        {
            await RunAsync(job, ct);
        }
        catch (Exception ex)
        {
            await uow.UploadJobs.FailAsync(job.Id, ex.Message, ct);
        }
    }

    public async Task RunAsync(UploadJob job, CancellationToken ct = default)
    {
        var config = UploadJobConfig.Parse(job.Payload);

        var replace = config.Mode == "replace" ? await LoadReplaceTargetAsync(config, ct) : null;
        if (await uow.Groups.FindAsync(config.GroupId, ct) is null)
            throw new InvalidDataException("المجموعة المحددة غير موجودة.");
        await ValidateConfigAsync(config, ct);

        byte[] bytes;
        try { bytes = await files.LoadAsync(config.Token.ToString(), ct); }
        catch (KeyNotFoundException) { throw new KeyNotFoundException("انتهت صلاحية ملف الرفع. أعد رفع المصنف."); }

        Guid? createdFileId = null;
        try
        {
            createdFileId = await ExecuteImportAsync(job.Id, config, bytes, replace, ct);
            if (replace is not null)
                await PromoteReplacementAsync(job.Id, config, replace, createdFileId.Value, ct);
        }
        catch
        {
            // New partial data is removed so a failed import (or replacement)
            // never leaves leftovers; the old dataset is untouched.
            if (createdFileId.HasValue)
                await uow.UploadJobs.DeleteFileAsync(createdFileId.Value, ct);
            throw;
        }
        finally
        {
            files.Remove(config.Token.ToString());
        }
    }

    private sealed record ReplaceTarget(Guid Id, Guid GroupId, string Name, string Description,
        int Version, int RowCount);

    private async Task<ReplaceTarget?> LoadReplaceTargetAsync(UploadJobConfig config, CancellationToken ct)
    {
        if (config.FileId is null) throw new InvalidDataException("إعدادات الاستبدال غير مكتملة.");
        var target = await uow.Files.FindWithColumnsAsync(config.FileId.Value, ct)
            ?? throw new KeyNotFoundException("الملف المراد تحديثه غير موجود.");
        return new ReplaceTarget(target.Id, target.GroupId, target.Name, target.Description,
            target.Version, target.RowCount);
    }

    private async Task ValidateConfigAsync(UploadJobConfig config, CancellationToken ct)
    {
        if (config.Columns.Count == 0) throw new InvalidDataException("إعدادات مهمة الرفع غير صالحة.");
        var seen = new HashSet<StandardField>();
        foreach (var c in config.Columns)
        {
            if (string.IsNullOrWhiteSpace(c.HeaderRaw) || c.ColumnIndex < 1)
                throw new InvalidDataException("إعدادات مهمة الرفع غير صالحة.");
            if (c.StandardField is not null && !seen.Add(c.StandardField.Value))
                throw new InvalidDataException("لا يمكن ربط حقل قياسي واحد بأكثر من عمود.");
        }
        if (config.Linked is not null)
        {
            var err = headers.LinkedMappingError(config.SheetName, config.SheetIndex,
                config.Linked.SheetNames, config.Linked.NationalIdColumnIndex,
                config.Columns.Select(c => new InspectedColumn(c.HeaderRaw, c.HeaderNormalized, c.ColumnIndex,
                    c.StandardField is null ? null : StandardFieldKeys.Key(c.StandardField.Value), null)).ToList());
            if (err is not null) throw new InvalidDataException(err);
        }
        var categoryIds = config.Columns.Select(c => c.CategoryId).Where(g => g.HasValue).Select(g => g!.Value).Distinct().ToList();
        if (categoryIds.Count > 0 && await uow.Categories.CountAsync(c => categoryIds.Contains(c.Id), ct) != categoryIds.Count)
            throw new InvalidDataException("توجد فئة محددة لم تعد متاحة.");
    }

    private async Task<Guid> ExecuteImportAsync(
        Guid jobId, UploadJobConfig config, byte[] bytes,
        ReplaceTarget? replace, CancellationToken ct)
    {
        var spec = new WorkbookImportSpec(
            config.SheetName, config.SheetIndex,
            config.Linked is null ? null : new LinkedSheetsConfig(config.Linked.SheetNames, config.Linked.NationalIdColumnIndex),
            config.Columns.Select(c => new ImportColumnSpec(c.HeaderRaw, c.HeaderNormalized, c.ColumnIndex)).ToList());
        var import = await reader.ReadForImportAsync(bytes, config.Token.ToString(), spec, ct);

        // For replacements the payload name already IS the temporary staging name.
        var file = await CreateFileAsync(config, config.Name, import.WorksheetName, jobId, ct);

        var fileColumns = await uow.FileColumns.ListByFileAsync(file.Id, ct);
        var seenNational = new HashSet<string>(StringComparer.Ordinal);
        var batch = new List<Record>(BatchSize);
        var issues = new List<DataQualityIssue>();
        var processed = 0;
        var imported = 0;
        foreach (var row in import.Rows)
        {
            ct.ThrowIfCancellationRequested();
            processed++;
            var data = new Dictionary<string, string>();
            foreach (var column in config.Columns)
                data[column.HeaderRaw] = column.ColumnIndex - 1 < row.Values.Count
                    ? row.Values[column.ColumnIndex - 1] : "";
            if (data.Values.All(string.IsNullOrWhiteSpace))
            {
                issues.Add(new DataQualityIssue
                {
                    FileId = file.Id, RowIndex = row.RowIndex,
                    IssueType = DataQualityIssueType.EmptyRow,
                });
            }
            else
            {
                batch.Add(BuildRecord(file.Id, row.RowIndex, fileColumns, data, row.Styles));
                issues.AddRange(CollectIssues(file.Id, row.RowIndex, fileColumns, data, seenNational));
                imported++;
            }
            if (batch.Count + issues.Count >= BatchSize)
            {
                await FlushAsync(jobId, batch, issues, processed, ct);
                batch.Clear(); issues.Clear();
            }
        }
        await FlushAsync(jobId, batch, issues, processed, ct);

        await uow.ExecuteInTransactionAsync(async () =>
        {
            // The file row stays tracked (no tracker clearing in this path).
            file.RowCount = imported;
            file.UpdatedAt = DateTime.UtcNow;
            await uow.SaveChangesAsync(ct);
            var j = await uow.UploadJobs.FindAsync(jobId, ct);
            if (j is null) return;
            j.TotalRows = processed;
            j.ProcessedRows = processed;
            j.Status = replace is null ? UploadJobStatus.Done : j.Status;
            if (replace is null)
            {
                j.FinishedAt = DateTime.UtcNow;
                await uow.SaveChangesAsync(ct);
                await activity.WriteAsync(ActivityAction.FileUploaded, config.Name,
                    new { fileId = file.Id, rows = imported, sheetName = import.WorksheetName }, ct);
            }
            else
            {
                await uow.SaveChangesAsync(ct);
            }
        }, ct);
        return file.Id;
    }

    private async Task<FileEntity> CreateFileAsync(
        UploadJobConfig config, string fileName, string sheetName, Guid jobId, CancellationToken ct)
    {
        FileEntity? file = null;
        await uow.ExecuteInTransactionAsync(async () =>
        {
            // Re-checked at execution: a concurrent import may have taken the name.
            if (await uow.Files.NameExistsAsync(fileName, ct))
                throw new InvalidOperationException("اسم الملف مستخدم بالفعل. اختر اسمًا آخر.");
            file = new FileEntity
            {
                GroupId = config.GroupId, Name = fileName, Description = config.Description,
                OriginalFilename = config.OriginalFilename, SheetName = sheetName,
                RowCount = 0, ColumnSignature = reader.BuildColumnSignature(config.Columns.Select(c => c.HeaderRaw)),
                Version = 1, UploadedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            };
            await uow.Files.AddAsync(file, ct);
            var placements = config.Columns.Select(c => (c.CategoryId, c.StandardField)).ToList();
            var orders = await columns.AssignAsync(placements, ct);
            for (var i = 0; i < config.Columns.Count; i++)
            {
                var c = config.Columns[i];
                uow.FileColumns.Add(new FileColumn
                {
                    FileId = file.Id, HeaderRaw = c.HeaderRaw, HeaderNormalized = c.HeaderNormalized,
                    ColumnIndex = c.ColumnIndex, SortOrder = orders[i], CategoryId = c.CategoryId,
                    StandardField = c.StandardField,
                });
            }
            await uow.SaveChangesAsync(ct);
            var j = await uow.UploadJobs.FindAsync(jobId, ct);
            if (j is not null) j.FileId = file.Id;
            await uow.SaveChangesAsync(ct);
        }, ct);
        return file!;
    }

    private async Task FlushAsync(
        Guid jobId, List<Record> batch, List<DataQualityIssue> issues,
        int processed, CancellationToken ct)
    {
        if (batch.Count > 0) uow.Records.AddRange(batch);
        if (issues.Count > 0) uow.DataQuality.AddRange(issues);
        var job = await uow.UploadJobs.FindAsync(jobId, ct);
        if (job is not null)
        {
            job.ProcessedRows = processed;
            job.Status = UploadJobStatus.Inserting;
        }
        await uow.SaveChangesAsync(ct);
    }

    private static Record BuildRecord(
        Guid fileId, int rowIndex, IReadOnlyList<FileColumn> columns,
        Dictionary<string, string> data, IReadOnlyDictionary<string, CellStyleDto>? styles)
    {
        var fills = new Dictionary<string, string>();
        var fonts = new Dictionary<string, string>();
        if (styles is not null)
        {
            foreach (var column in columns)
            {
                if (!styles.TryGetValue(column.HeaderRaw, out var style)) continue;
                if (style.Fill is not null) fills[column.HeaderRaw] = style.Fill;
                if (style.Font is not null) fonts[column.HeaderRaw] = style.Font;
            }
        }
        var record = new Record
        {
            FileId = fileId,
            RowIndex = rowIndex,
            Data = JsonSerializer.SerializeToDocument(data),
            FmtFills = fills.Count > 0 ? JsonSerializer.SerializeToDocument(fills) : null,
            FmtFontColors = fonts.Count > 0 ? JsonSerializer.SerializeToDocument(fonts) : null,
        };
        var byField = new Dictionary<StandardField, string?>();
        foreach (var column in columns)
            if (column.StandardField.HasValue)
                byField[column.StandardField.Value] = data.TryGetValue(column.HeaderRaw, out var v) ? v : "";
        RecordShadowMapper.Apply(record, byField);
        return record;
    }

    private static List<DataQualityIssue> CollectIssues(
        Guid fileId, int rowIndex, IReadOnlyList<FileColumn> columns,
        Dictionary<string, string> data, HashSet<string> seenNational)
    {
        var fields = new Dictionary<StandardField, (string Header, string Value)>();
        foreach (var column in columns)
        {
            if (!column.StandardField.HasValue) continue;
            data.TryGetValue(column.HeaderRaw, out var v);
            fields[column.StandardField.Value] = (column.HeaderRaw, v ?? "");
        }
        var issues = RecordQualityChecker.CheckRow(fileId, rowIndex, fields, rowHasValue: true);
        var nationalRaw = fields.TryGetValue(StandardField.NationalId, out var n) ? n.Value : "";
        if (ArabicNormalizer.NationalIdIssue(nationalRaw) is null)
        {
            var digits = ArabicNormalizer.NationalIdDigits(nationalRaw)!;
            if (!seenNational.Add(digits))
                issues.Add(new DataQualityIssue
                {
                    FileId = fileId, RowIndex = rowIndex,
                    IssueType = DataQualityIssueType.DuplicateNationalId,
                    ColumnName = "الرقم الوطني", RawValue = nationalRaw,
                });
        }
        return issues;
    }

    private async Task PromoteReplacementAsync(
        Guid jobId, UploadJobConfig config,
        ReplaceTarget replace, Guid temporaryFileId, CancellationToken ct)
    {
        var mode = config.ReplaceMode ?? "different";
        await uow.ExecuteInTransactionAsync(async () =>
        {
            // The temp FILE_UPLOADED activity from staging is removed; only the
            // promotion activity below survives (V1 replacement-worker).
            var tempUploaded = await uow.ActivityLogs.ListByActionAsync(ActivityAction.FileUploaded, config.Name, ct);
            uow.ActivityLogs.RemoveRange(tempUploaded);

            var target = await uow.Files.FindAsync(replace.Id, ct)
                ?? throw new KeyNotFoundException("تعذر العثور على أحد إصداري الملف لإتمام الاستبدال.");
            var temporary = await uow.Files.FindAsync(temporaryFileId, ct)
                ?? throw new KeyNotFoundException("تعذر العثور على أحد إصداري الملف لإتمام الاستبدال.");
            var job = await uow.UploadJobs.FindAsync(jobId, ct);

            if (mode == "same")
            {
                var tempRowCount = temporary.RowCount;
                uow.Records.RemoveRange(await uow.Records.ListAsync(r => r.FileId == target.Id, ct));
                uow.DataQuality.RemoveRange(await uow.DataQuality.ListAsync(i => i.FileId == target.Id, ct));
                uow.FileColumns.RemoveRange(await uow.FileColumns.ListAsync(c => c.FileId == target.Id, ct));
                await uow.SaveChangesAsync(ct);
                // Re-point in entity form (ExecuteUpdateAsync is provider-specific).
                foreach (var r in await uow.Records.ListAsync(r => r.FileId == temporary.Id, ct))
                    r.FileId = target.Id;
                foreach (var i in await uow.DataQuality.ListAsync(i => i.FileId == temporary.Id, ct))
                    i.FileId = target.Id;
                foreach (var c in await uow.FileColumns.ListAsync(c => c.FileId == temporary.Id, ct))
                    c.FileId = target.Id;
                await uow.SaveChangesAsync(ct);
                uow.Files.Remove(temporary);
                target.OriginalFilename = temporary.OriginalFilename;
                target.SheetName = temporary.SheetName;
                target.RowCount = tempRowCount;
                target.ColumnSignature = temporary.ColumnSignature;
                target.UploadedAt = DateTime.UtcNow;
                if (job is not null)
                {
                    job.FileId = target.Id;
                    job.Status = UploadJobStatus.Done;
                    job.FinishedAt = DateTime.UtcNow;
                }
                await uow.SaveChangesAsync(ct);
                await activity.WriteAsync(ActivityAction.FileUpdated, target.Name,
                    new { fileId = target.Id, previousRows = replace.RowCount, newRows = tempRowCount }, ct);
            }
            else
            {
                var previousRows = target.RowCount;
                var newRows = temporary.RowCount;
                uow.Files.Remove(target);
                temporary.Name = target.Name;
                temporary.Description = target.Description;
                temporary.GroupId = target.GroupId;
                temporary.Version = target.Version + 1;
                temporary.UploadedAt = DateTime.UtcNow;
                if (job is not null)
                {
                    job.FileId = temporary.Id;
                    job.Status = UploadJobStatus.Done;
                    job.FinishedAt = DateTime.UtcNow;
                }
                await uow.SaveChangesAsync(ct);
                await activity.WriteAsync(ActivityAction.FileReplaced, target.Name,
                    new { previousFileId = target.Id, fileId = temporary.Id, version = temporary.Version, previousRows, newRows }, ct);
            }
        }, ct);
    }
}
