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
    // Bulk-audit cap: 50k RecordEdit rows max per replace (≈ user 9k case
    // with headroom). Guards against 10M-cell explosion OOMs.
    private const int MaxAuditEdits = 50000;

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
        // Only real (non-replacement) uploads record a V1 history row here;
        // replacement versions are recorded at promotion (N+1 / N+2).
        var file = await CreateFileAsync(config, config.Name, import.WorksheetName, jobId, replace is null, ct);

        var fileColumns = await uow.FileColumns.ListByFileAsync(file.Id, ct);
        // Per-cell keep-old choices (preview toggles): swap the workbook's value
        // for the stored one BEFORE the empty check and shadow/quality build,
        // so kept cells survive exactly as if the file had carried them.
        KeepOldPlan? keepPlan = null;
        if (replace is not null && config.KeepOldCells.Count > 0)
        {
            var targetColumns = await uow.FileColumns.ListByFileAsync(replace.Id, ct);
            var oldRecords = await uow.Records.ListExportRowsAsync(replace.Id, ct);
            keepPlan = KeepOldApplier.Build(oldRecords, targetColumns, config.Columns, config.KeepOldCells);
        }
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
            if (keepPlan is not null)
                KeepOldApplier.Apply(keepPlan, data, row.RowIndex);
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
        UploadJobConfig config, string fileName, string sheetName, Guid jobId, bool recordVersionRow, CancellationToken ct)
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
            if (recordVersionRow)
                uow.FileVersions.Add(new FileVersion
                {
                    FileId = file.Id, Version = 1,
                    Note = "الإصدار الأول عند رفع الملف.",
                    Kind = "upload", CreatedBy = config.RequestedBy,
                });
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

            // Versioned edit archive: LIVE manual edits of the old version are
            // preserved (stamped) instead of cascade-deleted. They stay
            // visible in the edit history, while record pages only ever show
            // current-version edits (archived rows carry no record id).
            // Already-archived rows keep their ORIGINAL version stamp and are
            // never re-stamped. Must run before any record/file deletion
            // below. ListAsync (not ListByFileAsync) returns tracked entities
            // so the changes save.
            // Version rule: clean update bumps N → N+1, but an update over
            // pending manual edits bumps N → N+2 so those edits keep their own
            // separate version (N+1) and the bulk update lands on N+2.
            var previousEdits = await uow.RecordEdits.ListAsync(e => e.FileId == replace.Id, ct);
            var pendingManualCount = previousEdits.Count(e => e.RecordId is not null && !e.IsBulk);
            var manualVersion = replace.Version + 1;
            var newVersion = pendingManualCount > 0 ? replace.Version + 2 : replace.Version + 1;
            foreach (var edit in previousEdits)
            {
                if (edit.RecordId is null) continue; // archived: keep its stamp
                // Live manual edits take their own separate version (N+1).
                // Bulk-audit rows keep their stamp: they ARE that version's
                // content, not pending work.
                if (!edit.IsBulk)
                    edit.FileVersion = pendingManualCount > 0 ? manualVersion : replace.Version;
                edit.RecordId = null;
                edit.FileColumnId = null;
                if (mode != "same")
                    edit.FileId = temporaryFileId;
            }
            await uow.SaveChangesAsync(ct);

            if (mode == "same")
            {
                var tempRowCount = temporary.RowCount;
                // Bulk-audit snapshot BEFORE deletion: every cell that actually
                // changed (after keep-old choices were applied during import)
                // becomes a RecordEdit row stamped with the NEW version
                // (N+1, or N+2 when pending manual edits took N+1), so the
                // edits page shows the whole bulk update as one version.
                var auditEdits = await BuildReplaceAuditAsync(
                    target.Id, temporary.Id, newVersion, target.Id,
                    config.RequestedBy, ct);
                uow.Records.RemoveRange(await uow.Records.ListAsync(r => r.FileId == target.Id, ct));
                uow.DataQuality.RemoveRange(await uow.DataQuality.ListAsync(i => i.FileId == target.Id, ct));
                uow.FileColumns.RemoveRange(await uow.FileColumns.ListAsync(c => c.FileId == target.Id, ct));
                await uow.SaveChangesAsync(ct);
                // Re-point in entity form (ExecuteUpdateAsync is provider-specific).
                foreach (var r in await uow.Records.ListAsync(r => r.FileId == temporary.Id, ct))
                    r.FileId = target.Id;
                foreach (var i in await uow.DataQuality.ListAsync(i => i.FileId == temporary.Id, ct))
                    i.FileId = target.Id;
                var newColIds = new Dictionary<string, Guid>(StringComparer.Ordinal);
                foreach (var c in await uow.FileColumns.ListAsync(c => c.FileId == temporary.Id, ct))
                {
                    c.FileId = target.Id;
                    newColIds[c.HeaderRaw] = c.Id;
                }
                await uow.SaveChangesAsync(ct);
                uow.Files.Remove(temporary);
                target.OriginalFilename = temporary.OriginalFilename;
                target.SheetName = temporary.SheetName;
                target.RowCount = tempRowCount;
                target.ColumnSignature = temporary.ColumnSignature;
                target.UploadedAt = DateTime.UtcNow;
                target.UpdatedAt = DateTime.UtcNow;
                // Replacing all rows is a new version even when the structure
                // is identical, so the UI can label it V+1 (or V+2 with
                // pending manual edits) and the archived edits above stay
                // attributed to their own version.
                target.Version = newVersion;
                if (job is not null)
                {
                    job.FileId = target.Id;
                    job.Status = UploadJobStatus.Done;
                    job.FinishedAt = DateTime.UtcNow;
                }
                await uow.SaveChangesAsync(ct);
                // Re-bind audit rows to the re-pointed record/column ids (ids
                // themselves are stable across the re-point; only the file
                // link changed, which we already set to target.Id).
                // FileColumnId was resolved from the temp columns snapshot;
                // refresh from the re-pointed map in case of duplicates.
                foreach (var e in auditEdits)
                {
                    if (newColIds.TryGetValue(e.HeaderRaw, out var cid))
                        e.FileColumnId = cid;
                    e.FileId = target.Id;
                    e.FileVersion = target.Version;
                }
                if (auditEdits.Count > 0)
                {
                    uow.RecordEdits.AddRange(auditEdits);
                    await uow.SaveChangesAsync(ct);
                }
                if (pendingManualCount > 0)
                    uow.FileVersions.Add(new FileVersion
                    {
                        FileId = target.Id, Version = manualVersion,
                        Note = $"تعديلات يدوية على الإصدار {replace.Version} ({pendingManualCount}) حُفظت في إصدار منفصل عند التحديث.",
                        Kind = "manual", CreatedBy = config.RequestedBy,
                    });
                uow.FileVersions.Add(new FileVersion
                {
                    FileId = target.Id, Version = newVersion,
                    Note = $"تحديث الملف: {replace.RowCount} ← {tempRowCount} سجل ({auditEdits.Count} خلية متغيرة).",
                    Kind = "update", CreatedBy = config.RequestedBy,
                });
                await uow.SaveChangesAsync(ct);
                await activity.WriteAsync(ActivityAction.FileUpdated, target.Name,
                    new { fileId = target.Id, version = target.Version, previousVersion = replace.Version, manualVersion = pendingManualCount > 0 ? manualVersion : (int?)null, archivedManualEdits = pendingManualCount, previousRows = replace.RowCount, newRows = tempRowCount, keptOldCells = config.KeepOldCells.Count, bulkEditCount = auditEdits.Count }, ct);
            }
            else
            {
                var previousRows = target.RowCount;
                var newRowsCount = temporary.RowCount;
                var auditEdits = await BuildReplaceAuditAsync(
                    target.Id, temporaryFileId, newVersion, temporaryFileId,
                    config.RequestedBy, ct);
                uow.Files.Remove(target);
                temporary.Name = target.Name;
                temporary.Description = target.Description;
                temporary.GroupId = target.GroupId;
                temporary.Version = newVersion;
                temporary.UploadedAt = DateTime.UtcNow;
                if (job is not null)
                {
                    job.FileId = temporary.Id;
                    job.Status = UploadJobStatus.Done;
                    job.FinishedAt = DateTime.UtcNow;
                }
                await uow.SaveChangesAsync(ct);
                foreach (var e in auditEdits)
                {
                    e.FileId = temporary.Id;
                    e.FileVersion = newVersion;
                }
                if (auditEdits.Count > 0)
                {
                    uow.RecordEdits.AddRange(auditEdits);
                    await uow.SaveChangesAsync(ct);
                }
                if (pendingManualCount > 0)
                    uow.FileVersions.Add(new FileVersion
                    {
                        FileId = temporary.Id, Version = manualVersion,
                        Note = $"تعديلات يدوية على الإصدار {replace.Version} ({pendingManualCount}) حُفظت في إصدار منفصل عند التحديث.",
                        Kind = "manual", CreatedBy = config.RequestedBy,
                    });
                uow.FileVersions.Add(new FileVersion
                {
                    FileId = temporary.Id, Version = newVersion,
                    Note = $"تحديث الملف ببنية بديلة: {previousRows} ← {newRowsCount} سجل ({auditEdits.Count} خلية متغيرة).",
                    Kind = "update", CreatedBy = config.RequestedBy,
                });
                await uow.SaveChangesAsync(ct);
                await activity.WriteAsync(ActivityAction.FileReplaced, target.Name,
                    new { previousFileId = target.Id, fileId = temporary.Id, version = temporary.Version, previousVersion = replace.Version, manualVersion = pendingManualCount > 0 ? manualVersion : (int?)null, archivedManualEdits = pendingManualCount, previousRows, newRows = newRowsCount, keptOldCells = config.KeepOldCells.Count, bulkEditCount = auditEdits.Count }, ct);
            }
        }, ct);
    }

    /// <summary>Builds the V(N+1) bulk audit: every cell whose stored value
    /// differs after the replace becomes a RecordEdit (old → new) stamped
    /// with the new version. Row identity mirrors the preview (national-id
    /// key when it covers ≥70% uniquely, else positional by RowIndex order).
    /// Kept-old cells already carry the old value in the temp rows, so they
    /// naturally produce no diff and are not logged.</summary>
    private async Task<List<RecordEdit>> BuildReplaceAuditAsync(
        Guid oldFileId, Guid newFileId, int newVersion, Guid auditFileId,
        string? requestedBy, CancellationToken ct)
    {
        var oldRows = await uow.Records.ListExportRowsAsync(oldFileId, ct);
        var newRows = await uow.Records.ListExportRowsAsync(newFileId, ct);
        if (oldRows.Count == 0 || newRows.Count == 0) return [];
        var oldCols = await uow.FileColumns.ListByFileAsync(oldFileId, ct);
        var newCols = await uow.FileColumns.ListByFileAsync(newFileId, ct);
        if (oldCols.Count == 0 || newCols.Count == 0) return [];

        var newByNorm = new Dictionary<string, FileColumn>(StringComparer.Ordinal);
        foreach (var c in newCols)
            newByNorm.TryAdd(c.HeaderNormalized, c);
        // Common columns as (old header, new column entity).
        var common = new List<(string OldRaw, FileColumn NewCol)>();
        foreach (var oc in oldCols.OrderBy(c => c.ColumnIndex))
            if (newByNorm.TryGetValue(oc.HeaderNormalized, out var nc))
                common.Add((oc.HeaderRaw, nc));
        if (common.Count == 0) return [];

        var oldMaps = oldRows.Select(r => (r.Id, r.RowIndex, Map: RowMap(r.Data))).ToList();
        var newMaps = newRows.Select(r => (r.Id, r.RowIndex, Map: RowMap(r.Data))).ToList();

        // National-id key matching when it covers most rows uniquely.
        var oldNational = oldCols.FirstOrDefault(c => c.StandardField == StandardField.NationalId);
        var newNational = newCols.FirstOrDefault(c => c.StandardField == StandardField.NationalId);
        var useKey = false;
        Dictionary<string, int>? oldKeyToIdx = null;
        Dictionary<string, int>? newKeyToIdx = null;
        if (oldNational is not null && newNational is not null)
        {
            var curMap = new Dictionary<string, int>(StringComparer.Ordinal);
            var dup = false;
            for (var i = 0; i < oldMaps.Count && !dup; i++)
            {
                oldMaps[i].Map.TryGetValue(oldNational.HeaderRaw, out var v);
                var key = ArabicNormalizer.NationalIdDigits(v ?? "");
                if (key is null) continue;
                if (!curMap.TryAdd(key, i)) dup = true;
            }
            var nxtMap = new Dictionary<string, int>(StringComparer.Ordinal);
            if (!dup)
            {
                for (var i = 0; i < newMaps.Count && !dup; i++)
                {
                    newMaps[i].Map.TryGetValue(newNational.HeaderRaw, out var v);
                    var key = ArabicNormalizer.NationalIdDigits(v ?? "");
                    if (key is null) continue;
                    if (!nxtMap.TryAdd(key, i)) dup = true;
                }
            }
            if (!dup && oldMaps.Count > 0 && newMaps.Count > 0
                && curMap.Count >= oldMaps.Count * 0.7
                && nxtMap.Count >= newMaps.Count * 0.7)
            {
                useKey = true;
                oldKeyToIdx = curMap;
                newKeyToIdx = nxtMap;
            }
        }

        var pairs = new List<(int NewIdx, int OldIdx)>();
        if (useKey)
        {
            foreach (var kv in newKeyToIdx!)
                if (oldKeyToIdx!.TryGetValue(kv.Key, out var oi))
                    pairs.Add((kv.Value, oi));
        }
        else
        {
            var orderedOld = oldMaps
                .Select((r, i) => (r, i))
                .OrderBy(x => x.r.RowIndex)
                .ToList();
            var orderedNew = newMaps
                .Select((r, i) => (r, i))
                .OrderBy(x => x.r.RowIndex)
                .ToList();
            var matched = Math.Min(orderedOld.Count, orderedNew.Count);
            for (var i = 0; i < matched; i++)
                pairs.Add((orderedNew[i].i, orderedOld[i].i));
        }

        var editedBy = string.IsNullOrWhiteSpace(requestedBy) ? "system" : requestedBy.Trim();
        var nationalHeader = newCols
            .FirstOrDefault(c => c.StandardField == StandardField.NationalId)?.HeaderRaw;
        var result = new List<RecordEdit>(Math.Min(pairs.Count * common.Count, MaxAuditEdits));
        foreach (var (ni, oi) in pairs)
        {
            ct.ThrowIfCancellationRequested();
            var oldMap = oldMaps[oi].Map;
            var newEntry = newMaps[ni];
            string? nationalId = null;
            if (nationalHeader is not null)
            {
                newEntry.Map.TryGetValue(nationalHeader, out var nationalRaw);
                var norm = ArabicNormalizer.NormalizeNationalId(nationalRaw ?? "");
                nationalId = string.IsNullOrEmpty(norm) ? null : norm;
            }
            foreach (var (oldRaw, newCol) in common)
            {
                oldMap.TryGetValue(oldRaw, out var ov);
                newEntry.Map.TryGetValue(newCol.HeaderRaw, out var nv);
                ov ??= "";
                nv ??= "";
                // Same equivalence as the preview: formatting-only differences
                // (leading zeros, date order, spacing...) are the same logical
                // value and must not pollute the audit log with phantom edits.
                if (ValueEquivalence.AreEquivalent(ov, nv)) continue;
                if (result.Count >= MaxAuditEdits) return result;
                result.Add(new RecordEdit
                {
                    RecordId = newEntry.Id,
                    FileId = auditFileId,
                    FileColumnId = newCol.Id,
                    FileVersion = newVersion,
                    HeaderRaw = newCol.HeaderRaw,
                    OldValue = ov.Length <= 5000 ? ov : ov[..5000],
                    NewValue = nv.Length <= 5000 ? nv : nv[..5000],
                    EditedBy = editedBy,
                    NationalId = nationalId,
                    IsBulk = true,
                });
            }
        }
        return result;
    }

    private static Dictionary<string, string> RowMap(JsonDocument? doc)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        if (doc is null || doc.RootElement.ValueKind != JsonValueKind.Object) return map;
        foreach (var p in doc.RootElement.EnumerateObject())
            map[p.Name] = p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() ?? ""
                : p.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ? ""
                : p.Value.GetRawText();
        return map;
    }
}
