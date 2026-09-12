using ExcelArchive.Application.DTOs.MergeDto;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Interfaces.Storage;
using ExcelArchive.Domain.Merge;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Application.Services;

/// <summary>
/// Two-file merge service (P5.1–P5.2). Isolated file store + 12h sessions,
/// table-aware inspection, validated nine-field mappings, six-rule ordered
/// matching (strict + relaxed), delete-and-relink, three-sheet export.
/// Never reads or writes archive records.
/// </summary>
public class MergeService(
    IMergeFileStore mergeFiles,
    IMergeSessionStore mergeSessions,
    IMergeExportStore mergeExports,
    IMergeExcelReader reader,
    IMergeExportBuilder exports) : IMergeService
{
    public MergeInspection Inspect(byte[] content, string fileName)
    {
        var view = reader.ReadWorkbook(content);
        var token = mergeFiles.Save(fileName, content);
        return new MergeInspection(token, fileName, view.Sheets, view.Selected,
            MergeSuggest.Suggest(view.Selected.Headers).Fields);
    }

    public MergeSelectedSheet InspectSheet(Guid token, string sheetName)
    {
        var content = mergeFiles.Load(token);
        var sheet = reader.ReadSheet(content, sheetName);
        return new MergeSelectedSheet(sheet.SheetName, sheet.Headers,
            sheet.Rows.Take(6).Select(r => (IReadOnlyList<string>)r.Cells.ToList()).ToList(),
            sheet.TotalRows, sheet.ColumnCount);
    }

    public IReadOnlyDictionary<string, int> SuggestMapping(IReadOnlyList<string> headers)
        => MergeSuggest.Suggest(headers).Fields;

    public MergeRunResult Run(MergeRunArgs args, Action<int, string?>? onProgress = null)
    {
        MergeMapping leftMapping, rightMapping;
        try
        {
            leftMapping = MergeMapping.From(args.LeftMapping);
            rightMapping = MergeMapping.From(args.RightMapping);
        }
        catch (ArgumentException ex)
        {
            throw new InvalidDataException(ex.Message);
        }
        if (!MergeEngine.HasCommonRule(leftMapping, rightMapping))
            throw new InvalidOperationException(
                "لا توجد قاعدة ربط ممكنة: يجب تحديد عمود الاسم الثلاثي (أو أعمدة الاسم واسم الأب والنسبة) أو أحد الأرقام في الجدولين.");
        onProgress?.Invoke(5, "قراءة الجدول الأول…");
        var left = ReadMergeSheet(args.LeftToken, args.LeftSheet);
        onProgress?.Invoke(20, "قراءة الجدول الثاني…");
        var right = ReadMergeSheet(args.RightToken, args.RightSheet);
        onProgress?.Invoke(30, null);
        var result = MergeEngine.RunMerge(
            new MergeTableInput(left.Headers, left.Rows
                .Select(r => new MergeRowInput(r.RowNumber, r.Cells)).ToList(), leftMapping),
            new MergeTableInput(right.Headers, right.Rows
                .Select(r => new MergeRowInput(r.RowNumber, r.Cells)).ToList(), rightMapping),
            1, requireConfirmation: !args.IgnoreConfirmation,
            onRuleDone: (rule, index, total) => onProgress?.Invoke(
                30 + (int)Math.Round((index + 1) / (double)total * 60),
                $"تطبيق القاعدة {index + 1} من {total}…"));
        onProgress?.Invoke(95, "تجهيز النتائج…");
        var session = mergeSessions.Create(
            left.SheetName, left.Headers.ToList(), result.Left, leftMapping,
            right.SheetName, right.Headers.ToList(), result.Right, rightMapping,
            args.IgnoreConfirmation);
        return new MergeRunResult(session.Id, session.LeftHeaders, session.RightHeaders,
            session.IgnoreConfirmation,
            MergeEngine.Summarize(session.LeftRows, session.RightRows, leftMapping, rightMapping));
    }

    public (MergeSessionData Session, MergeResult Result) DeleteKey(
        Guid sessionId, string table, int rowNumber)
    {
        if (table is not ("left" or "right"))
            throw new InvalidDataException("بيانات غير صالحة.");
        if (rowNumber < 2)
            throw new InvalidDataException("بيانات غير صالحة.");
        var result = mergeSessions.DeletePairKeyAndRelink(sessionId, table, rowNumber);
        return (mergeSessions.Get(sessionId), result);
    }

    public MergeSessionData GetSession(Guid sessionId) => mergeSessions.Get(sessionId);

    /// <summary>V1 merge/export: three-sheet workbook for confirmed/all scope.</summary>
    public (byte[] Bytes, string Filename) ExportScoped(Guid sessionId, string scope)
    {
        if (scope != "confirmed" && scope != "all")
            throw new InvalidDataException("نوع التصدير غير صالح.");
        var session = mergeSessions.Get(sessionId);
        var bytes = exports.Build(
            session.LeftHeaders, session.LeftRows,
            session.RightHeaders, session.RightRows, scope);
        return (bytes, exports.FileName(scope));
    }

    /// <summary>Async export: builds the workbook off-request with streamed
    /// progress (the sync build takes ~60s for large tables, beyond proxy idle
    /// limits) and stores the buffer for instant download by id.</summary>
    public async Task<MergeExportReadyResult> PrepareExportAsync(
        Guid sessionId, string scope,
        Action<int, string?>? onProgress = null, CancellationToken ct = default)
    {
        if (scope != "confirmed" && scope != "all")
            throw new InvalidDataException("نوع التصدير غير صالح.");
        var session = mergeSessions.Get(sessionId);
        var buffer = await Task.Run(() => exports.Build(
            session.LeftHeaders, session.LeftRows,
            session.RightHeaders, session.RightRows, scope,
            (percent, detail) =>
            {
                ct.ThrowIfCancellationRequested();
                onProgress?.Invoke(percent, detail);
            }), ct);
        var payload = mergeExports.SaveExport(buffer, exports.FileName(scope));
        return new MergeExportReadyResult(payload.Id, payload.Filename, buffer.Length);
    }

    public (byte[] Bytes, string Filename, long Size) DownloadExport(Guid downloadId)
    {
        var payload = mergeExports.GetExport(downloadId);
        return (payload.Buffer, payload.Filename, payload.Buffer.Length);
    }

    private (string SheetName, List<string> Headers, List<(int RowNumber, List<string> Cells)> Rows)
        ReadMergeSheet(Guid token, string sheetName)
    {
        var content = mergeFiles.Load(token);
        var sheet = reader.ReadSheet(content, sheetName);
        return (sheet.SheetName, sheet.Headers.ToList(),
            sheet.Rows.Select(r => (r.RowNumber, r.Cells.ToList())).ToList());
}
}
