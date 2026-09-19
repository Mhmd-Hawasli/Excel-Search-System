using ExcelArchive.Application.DTOs.BulkSearchDto;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Interfaces.Storage;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Application.Services;

/// <summary>
/// Bulk search (البحث الجماعي): reads the searched values from one Excel
/// column of an isolated upload, runs each value through the archive top-N
/// search (custom single-reference-field mode, one SELECT per value, no
/// COUNT), and keeps only high matches (نسبة التطابق ≥ 80%, first 10 per
/// value). Values are searched in parallel. Each searched value is repeated
/// per matching archive row. Never reads or writes archive records except
/// via the search read model; the upload never lands in the archive.
/// </summary>
public class BulkSearchService(
    IBulkSearchFileStore files,
    IMergeExcelReader reader,
    ISearchService search) : IBulkSearchService
{
    /// <summary>Concurrent per-value searches (each opens its own connection).</summary>
    private const int MaxParallelism = 8;

    public BulkSearchInspection Inspect(byte[] content, string fileName)
    {
        var view = reader.ReadWorkbook(content);
        var token = files.Save(fileName, content);
        return new BulkSearchInspection(
            token,
            fileName,
            view.Sheets.Select(s => new BulkSearchSheetBrief(s.Name, s.RowCount)).ToList(),
            ToSelected(view.Selected.SheetName, view.Selected.Headers,
                view.Selected.Preview, view.Selected.RowCount, view.Selected.ColumnCount));
    }

    public BulkSearchSelectedSheet InspectSheet(Guid token, string sheetName)
    {
        var content = files.Load(token);
        var sheet = reader.ReadSheet(content, sheetName);
        return ToSelected(sheet.SheetName, sheet.Headers,
            sheet.Rows.Take(6).Select(r => (IReadOnlyList<string>)r.Cells.ToList()).ToList(),
            sheet.TotalRows, sheet.ColumnCount);
    }

    public async Task<BulkSearchResult> RunAsync(
        BulkSearchRunArgs args,
        IReadOnlyList<Guid> groupIds,
        IReadOnlyList<Guid> fileIds,
        IReadOnlyList<Guid>? allowedFileIds,
        Action<int, string?>? onProgress = null,
        CancellationToken ct = default)
    {
        if (!BulkSearchMatch.IsSupportedField(args.Field))
            throw new InvalidDataException("اختر العمود المرجعي من البيانات المحفوظة في النظام.");
        if (args.ColumnIndex < 0)
            throw new InvalidDataException("اختر عمود الاكسيل المرتبط بالعمود المرجعي.");

        var content = files.Load(args.Token);
        var sheet = reader.ReadSheet(content, args.SheetName);
        if (args.ColumnIndex >= sheet.Headers.Count)
            throw new InvalidDataException("عمود الاكسيل المحدد غير موجود في الورقة.");
        if (allowedFileIds is not null && allowedFileIds.Count == 0)
            return Empty(args.Field);

        var queries = BulkSearchMatch.DistinctQueries(sheet.Rows.Select(r =>
            args.ColumnIndex < r.Cells.Count ? r.Cells[args.ColumnIndex] : ""));
        if (queries.Count == 0)
            throw new InvalidDataException("لم يتم العثور على قيم للبحث في عمود الاكسيل المحدد.");

        var slots = new List<BulkSearchRow>?[queries.Count];
        var completed = 0;
        var progressLock = new object();
        await Parallel.ForEachAsync(
            queries.Select((query, index) => (query, index)),
            new ParallelOptions { MaxDegreeOfParallelism = MaxParallelism, CancellationToken = ct },
            async (item, token) =>
            {
                slots[item.index] = await SearchValueAsync(
                    item.query, item.index + 1, args.Field, groupIds, fileIds, allowedFileIds, token);
                var done = Interlocked.Increment(ref completed);
                // Response-body writes are not thread-safe: serialize progress.
                lock (progressLock)
                    onProgress?.Invoke(5 + (int)Math.Round(done / (double)queries.Count * 90),
                        $"جارٍ البحث {done} من {queries.Count}…");
            });

        var rows = new List<BulkSearchRow>();
        var unmatched = new List<BulkSearchUnmatched>();
        for (var i = 0; i < queries.Count; i++)
        {
            if (slots[i] is { Count: > 0 } matches) rows.AddRange(matches);
            else unmatched.Add(new BulkSearchUnmatched(i + 1, queries[i]));
        }
        onProgress?.Invoke(100, null);
        return new BulkSearchResult(
            args.Field,
            queries.Count,
            queries.Count - unmatched.Count,
            unmatched.Count,
            unmatched,
            rows,
            rows.Count,
            false);
    }

    private async Task<List<BulkSearchRow>> SearchValueAsync(
        string query, int sequence, string field,
        IReadOnlyList<Guid> groupIds, IReadOnlyList<Guid> fileIds,
        IReadOnlyList<Guid>? allowedFileIds, CancellationToken ct)
    {
        // General one-word text queries (e.g. just "محمد") can never be a
        // high match: skip the database entirely, report as unmatched.
        if (BulkSearchMatch.IsTooGeneral(field, query)) return [];

        // Single top-N SELECT per value (no COUNT): first ranked rows only.
        var top = await search.SearchTopAsync(
            field, query, groupIds, fileIds, allowedFileIds,
            BulkSearchMatch.MaxMatchesPerValue, ct);
        if (top.Count == 0) return [];

        var matches = new List<BulkSearchRow>();
        foreach (var row in top)
        {
            var percent = BulkSearchMatch.Percent(field, query, StoredFor(row, field));
            if (percent < BulkSearchMatch.HighThreshold) continue;
            matches.Add(new BulkSearchRow(
                sequence,
                query,
                field,
                row.GroupName,
                row.FileName,
                row.RowIndex,
                row.SfFullName,
                row.DNationalId ?? row.SfNationalId,
                row.SfShamCash,
                row.SfPersonalNo,
                percent));
            if (matches.Count >= BulkSearchMatch.MaxMatchesPerValue) break;
        }
        return matches
            .OrderByDescending(m => m.MatchPercent)
            .ThenBy(m => m.FileName, StringComparer.Ordinal)
            .ThenBy(m => m.RowIndex)
            .ToList();
    }

    /// <summary>Stored archive value of the reference field for similarity scoring.</summary>
    internal static string? StoredFor(DTOs.SearchDto.SearchResultRow row, string field) => field switch
    {
        "full_name" => row.SfFullName,
        "first_name" => row.SfFirstName,
        "father_name" => row.SfFatherName,
        "last_name" => row.SfLastName,
        "mother_name" => row.SfMotherName,
        "national_id" => row.DNationalId ?? row.SfNationalId,
        "sham_cash" => row.SfShamCash,
        "personal_no" => row.SfPersonalNo,
        "phone" => row.SfPhone,
        "contract_code" => row.SfContractCode,
        "secondary_contract_code" => row.SfSecondaryContractCode,
        "job_title" => row.SfJobTitle,
        "functional_category" => row.SfFunctionalCategory?.ToString(),
        "organizational_level" => row.SfOrganizationalLevel,
        _ => null,
    };

    private static BulkSearchResult Empty(string field)
        => new(field, 0, 0, 0, [], [], 0, false);

    private static BulkSearchSelectedSheet ToSelected(
        string sheetName, IReadOnlyList<string> headers,
        IReadOnlyList<IReadOnlyList<string>> preview, int rowCount, int columnCount)
        => new(sheetName, headers, preview, rowCount, columnCount);
}
