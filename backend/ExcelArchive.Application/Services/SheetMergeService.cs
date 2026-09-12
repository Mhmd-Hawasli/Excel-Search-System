using ExcelArchive.Application.DTOs.SheetMergeDto;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Interfaces.Storage;
using ExcelArchive.Domain.SheetMerge;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Application.Services;

/// <summary>
/// Sheet-merge application service (P5.3). Port of V1
/// lib/sheet-merge/{workbook,store}.ts onto ClosedXML: in-memory workbook
/// parsing (table bounds captured before filter normalization), merge runs,
/// and prepared export buffers. Progress callbacks feed NDJSON (P5.4).
/// </summary>
public class SheetMergeService(
    ISheetMergeStore store,
    ISheetMergeParser parser,
    ISheetMergeExportBuilder exports) : ISheetMergeService
{
    private const int PreviewRows = 6;
    private const int SampleRows = 40;

    public async Task<SheetMergeUploadResult> UploadAsync(
        byte[] content, string fileName,
        Action<int, string?>? onProgress = null, CancellationToken ct = default)
    {
        var uploaded = await parser.ParseAsync(content, fileName, onProgress, ct);
        store.SaveUpload(uploaded);
        return ToInspection(uploaded);
    }

    public Task<SheetMergeRunResult> RunAsync(
        Guid uploadId, int nationalIdColumn, IReadOnlyList<string> sheetNames,
        Action<int, string?>? onProgress = null, CancellationToken ct = default)
    {
        var uploaded = store.GetUpload(uploadId);
        var built = SheetMergeEngine.Build(uploaded, nationalIdColumn, sheetNames,
            (percent, detail) =>
            {
                ct.ThrowIfCancellationRequested();
                onProgress?.Invoke(percent, detail);
            });
        var session = store.SaveSession(uploadId, nationalIdColumn,
            built.Stats.Sheets.Skip(1).Select(s => s.SheetName).ToList(), built.Stats with
            {
                Sheets = built.Stats.Sheets,
            });
        var stats = built.Stats;
        return Task.FromResult(new SheetMergeRunResult(
            session.Id, stats.OriginalFilename, stats.MainSheetName,
            stats.NationalIdColumn, stats.NationalIdHeader,
            stats.ExportHeaders, stats.ExportRowCount, stats.LinkPercent, stats.Sheets));
    }

    public async Task<SheetMergeReadyResult> PrepareExportAsync(
        Guid sessionId, Action<int, string?>? onProgress = null, CancellationToken ct = default)
    {
        var session = store.GetSession(sessionId);
        var uploaded = store.GetUpload(session.UploadId);
        var built = SheetMergeEngine.Build(uploaded, session.NationalIdColumn, session.SheetNames);
        var buffer = await Task.Run(
            () => exports.Build(built, onProgress, ct), ct);
        var date = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var payload = store.SaveExport(buffer,
            $"{SheetMergeLimits.ExportBasename}-{date}.xlsx", 1 + built.UnlinkedSheets.Count);
        return new SheetMergeReadyResult(payload.Id, payload.Filename, buffer.Length, payload.SheetCount);
    }

    public (byte[] Bytes, string Filename, long Size) Download(Guid downloadId)
    {
        var payload = store.GetExport(downloadId);
        return (payload.Buffer, payload.Filename, payload.Buffer.Length);
    }

    private static SheetMergeUploadResult ToInspection(UploadedWorkbook uploaded)
    {
        var main = uploaded.Sheets[0];
        return new SheetMergeUploadResult(
            uploaded.Id, uploaded.OriginalFilename, uploaded.Sheets.Count,
            uploaded.Sheets.Select(Summarize).ToList(),
            new SheetMergeUploadMain(main.Name, main.Headers.ToList(),
                main.Rows.Take(PreviewRows).Select(r => (IReadOnlyList<string>)r.Cells.ToList()).ToList(),
                main.Rows.Count),
            SheetMergeSuggest.Suggest(main.Headers,
                main.Rows.Take(SampleRows).Select(r => (IReadOnlyList<string>)r.Cells.ToList()).ToList()));
    }

    private static SheetMergeUploadSheet Summarize(UploadedSheet sheet)
    {
        var linkable = sheet.Headers.Count >= 2;
        return new SheetMergeUploadSheet(
            sheet.Name, sheet.Hidden, sheet.Rows.Count, sheet.Headers.Count,
            sheet.Headers.Count > 0 ? sheet.Headers[0] : "—",
            sheet.FiltersRemoved, linkable,
            linkable ? null : "تحتوي الصفحة على عمود واحد فقط؛ يلزم الرقم الوطني في العمود الأول وعمود معلومات واحد على الأقل بعده.");
    }
}
