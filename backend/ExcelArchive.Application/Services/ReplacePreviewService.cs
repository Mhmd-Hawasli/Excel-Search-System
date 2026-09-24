using System.Text.Json;
using ExcelArchive.Application.DTOs.FileDto;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Interfaces.Storage;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Application.Services;

/// <summary>Cell-by-cell replace preview. Single Excel read + single DB
/// round-trip, O(cells) ordinal compares. Returns the FULL change list
/// (up to MaxSamples) sorted manual-first so the UI can paginate locally
/// without losing manually-edited rows beyond the first page.</summary>
public class ReplacePreviewService(
    IUnitOfWork uow,
    IWorkbookReader reader,
    IWorkbookFileStore files) : IReplacePreviewService
{
    // 50k changed cells ≈ 10-15MB JSON max; covers the reported 9k case
    // with headroom while still guarding against 10M-cell OOM blowups.
    private const int MaxSamples = 50000;
    private const int MaxRowSample = 50;
    private const int MaxValueLength = 300;

    public async Task<ReplacePreviewResponse> PreviewAsync(
        Guid fileId, ReplaceFileRequest request, CancellationToken ct = default)
    {
        if (request is null || request.Token is null || request.Token == Guid.Empty
            || string.IsNullOrWhiteSpace(request.OriginalFilename) || request.OriginalFilename.Length > 255
            || string.IsNullOrWhiteSpace(request.SheetName) || request.SheetName.Length > 255
            || request.SheetIndex < 1 || request.TotalRows < 0
            || request.Columns is null || request.Columns.Count == 0
            || (request.Mode != "same" && request.Mode != "different"))
            throw new InvalidDataException("إعدادات الاستبدال غير مكتملة.");

        var target = await uow.Files.FindWithColumnsAsync(fileId, ct)
            ?? throw new KeyNotFoundException("الملف المراد تحديثه غير موجود.");

        var mapped = request.Columns
            .Select(c => new ReplaceColumnDto(
                c.HeaderRaw ?? "", c.HeaderNormalized ?? "", c.ColumnIndex, c.StandardField, c.CategoryId))
            .ToList();
        if (mapped.Any(c => string.IsNullOrWhiteSpace(c.HeaderRaw) || c.ColumnIndex < 1))
            throw new InvalidDataException("إعدادات الاستبدال غير مكتملة.");

        var targetColumns = target.Columns.OrderBy(c => c.ColumnIndex).ToList();
        // Smart name-based matching (NOT positional): columns are matched by
        // normalized header name, so inserting/reordering columns no longer
        // invalidates the whole update. Additions are allowed (new columns are
        // reported separately); removals still require the alternate-version path.
        var newByNormalized = new Dictionary<string, ReplaceColumnDto>(StringComparer.Ordinal);
        foreach (var c in mapped)
        {
            var norm = c.HeaderNormalized ?? "";
            if (newByNormalized.ContainsKey(norm))
                throw new InvalidDataException("إعدادات الاستبدال غير مكتملة.");
            newByNormalized[norm] = c;
        }
        // Pending MANUAL edits decide the coming version: N+1 when clean,
        // N+2 when live manual edits exist (they take N+1 as their own
        // version). Bulk-audit rows are the current version's own content,
        // never pending.
        var pendingEditCount = (await uow.RecordEdits.ListAsync(e => e.FileId == fileId && e.RecordId != null && !e.IsBulk, ct)).Count;
        var nextVersion = target.Version + (pendingEditCount > 0 ? 2 : 1);
        var oldSet = new HashSet<string>(targetColumns.Select(c => c.HeaderNormalized), StringComparer.Ordinal);
        // Common columns as (system header, new-file header, system column index),
        // in system column order for a stable report.
        var commonPairs = new List<(string TargetRaw, string NewRaw, int ColumnIndex)>();
        foreach (var t in targetColumns)
            if (newByNormalized.TryGetValue(t.HeaderNormalized, out var n))
                commonPairs.Add((t.HeaderRaw, n.HeaderRaw, t.ColumnIndex));
        var addedMapped = mapped.Where(c => !oldSet.Contains(c.HeaderNormalized ?? "")).ToList();
        var addedColumns = addedMapped.Select(c => c.HeaderRaw).ToList();
        var newSet = new HashSet<string>(newByNormalized.Keys, StringComparer.Ordinal);
        var removedColumns = targetColumns
            .Where(c => !newSet.Contains(c.HeaderNormalized))
            .Select(c => c.HeaderRaw).ToList();
        var identical = removedColumns.Count == 0;

        if (!identical)
            return new ReplacePreviewResponse(false, addedColumns, removedColumns,
                null, null, null, null, null, false, null, null, target.Version,
                null, pendingEditCount, nextVersion);

        // Identical structure: compare data cell by cell.
        LinkedSheetsConfig? linked = null;
        if (request.LinkedSheets is not null)
        {
            if (request.LinkedSheets.SheetNames.Count == 0
                || request.LinkedSheets.SheetNames.Distinct(StringComparer.Ordinal).Count()
                    != request.LinkedSheets.SheetNames.Count
                || request.LinkedSheets.NationalIdColumnIndex < 1)
                throw new InvalidDataException("إعدادات الاستبدال غير مكتملة.");
            linked = new LinkedSheetsConfig(
                request.LinkedSheets.SheetNames, request.LinkedSheets.NationalIdColumnIndex);
        }

        byte[] bytes;
        try { bytes = await files.LoadAsync(request.Token.ToString()!, ct); }
        catch (KeyNotFoundException) { throw new KeyNotFoundException("انتهت صلاحية ملف الرفع. أعد رفع المصنف."); }

        var spec = new WorkbookImportSpec(
            request.SheetName, request.SheetIndex, linked,
            mapped.Select(c => new ImportColumnSpec(c.HeaderRaw, c.HeaderNormalized ?? "", c.ColumnIndex)).ToList());
        var import = await reader.ReadForImportAsync(bytes, request.Token.ToString()!, spec, ct);

        // New rows keyed by the NEW file's header names (all mapped columns,
        // including added ones), skipping fully-empty rows (import parity).
        var newRows = new List<(int RowIndex, Dictionary<string, string> Data)>(import.Rows.Count);
        foreach (var row in import.Rows)
        {
            ct.ThrowIfCancellationRequested();
            var data = new Dictionary<string, string>(StringComparer.Ordinal);
            var hasValue = false;
            foreach (var c in mapped)
            {
                var v = c.ColumnIndex >= 1 && c.ColumnIndex - 1 < row.Values.Count
                    ? row.Values[c.ColumnIndex - 1] : "";
                data[c.HeaderRaw] = v;
                if (!string.IsNullOrWhiteSpace(v)) hasValue = true;
            }
            if (!hasValue) continue;
            newRows.Add((row.RowIndex, data));
        }

        // Added columns: how many non-empty values each one brings.
        var newColumnStats = addedMapped
            .Select(c => new ReplacePreviewNewColumn(
                c.HeaderRaw, c.ColumnIndex,
                newRows.LongCount(r => r.Data.TryGetValue(c.HeaderRaw, out var v)
                    && !string.IsNullOrWhiteSpace(v))))
            .ToList();

        var records = await uow.Records.ListExportRowsAsync(fileId, ct);
        var currentRows = new List<(Guid RecordId, int RowIndex, Dictionary<string, string> Data)>(records.Count);
        var recordIdToRow = new Dictionary<Guid, int>(records.Count);
        foreach (var r in records)
        {
            ct.ThrowIfCancellationRequested();
            var data = new Dictionary<string, string>(StringComparer.Ordinal);
            if (r.Data is not null && r.Data.RootElement.ValueKind == JsonValueKind.Object)
            {
                foreach (var p in r.Data.RootElement.EnumerateObject())
                    data[p.Name] = p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() ?? ""
                        : p.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ? ""
                        : p.Value.GetRawText();
            }
            currentRows.Add((r.Id, r.RowIndex, data));
            recordIdToRow[r.Id] = r.RowIndex;
        }

        // Manual (internal) edits of the CURRENT version only: archived edits
        // carry a null record id and bulk-audit rows are version content, so
        // neither must flag preview rows as manually edited.
        var edits = await uow.RecordEdits.ListByFileAsync(fileId, ct);
        var editByCell = new Dictionary<(int Row, string Header), (string? By, DateTime At)>();
        foreach (var e in edits)
        {
            if (!e.RecordId.HasValue || e.IsBulk) continue;
            if (!recordIdToRow.TryGetValue(e.RecordId.Value, out var rowIndex)) continue;
            var key = (rowIndex, e.HeaderRaw);
            if (editByCell.TryGetValue(key, out var existing) && existing.At >= e.CreatedAt) continue;
            editByCell[key] = (e.EditedBy, e.CreatedAt);
        }

        // Match mode: NationalId key when it covers most rows uniquely,
        // otherwise positional (order) — same semantics as the actual replace
        // (delete-all + reinsert) so the report matches what will happen.
        // The key column itself is resolved by NAME on each side, so a moved
        // national-id column still matches.
        var nationalTarget = targetColumns
            .FirstOrDefault(c => c.StandardField == StandardField.NationalId);
        string? nationalIdHeader = nationalTarget?.HeaderRaw;
        string? nationalIdNewRaw = nationalTarget is null ? null
            : newByNormalized.TryGetValue(nationalTarget.HeaderNormalized, out var nn) ? nn.HeaderRaw : null;

        string matchMode = "positional";
        Dictionary<string, int>? currentKeyToIdx = null;
        Dictionary<string, int>? newKeyToIdx = null;
        var useKey = false;
        if (nationalIdHeader is not null && nationalIdNewRaw is not null)
        {
            var curMap = new Dictionary<string, int>(StringComparer.Ordinal);
            var dup = false;
            for (var i = 0; i < currentRows.Count; i++)
            {
                currentRows[i].Data.TryGetValue(nationalIdHeader, out var v);
                var key = ArabicNormalizer.NationalIdDigits(v ?? "");
                if (key is null) continue;
                if (curMap.ContainsKey(key)) { dup = true; break; }
                curMap[key] = i;
            }
            var newMap = new Dictionary<string, int>(StringComparer.Ordinal);
            if (!dup)
            {
                for (var i = 0; i < newRows.Count; i++)
                {
                    newRows[i].Data.TryGetValue(nationalIdNewRaw, out var v);
                    var key = ArabicNormalizer.NationalIdDigits(v ?? "");
                    if (key is null) continue;
                    if (newMap.ContainsKey(key)) { dup = true; break; }
                    newMap[key] = i;
                }
            }
            if (!dup)
            {
                var coverage = currentRows.Count > 0 && newRows.Count > 0
                    && curMap.Count >= currentRows.Count * 0.7
                    && newMap.Count >= newRows.Count * 0.7;
                if (coverage)
                {
                    useKey = true;
                    matchMode = "nationalId";
                    currentKeyToIdx = curMap;
                    newKeyToIdx = newMap;
                }
            }
        }

        var pairs = new List<(int DisplayRow, int CurrentIdx, int NewIdx, string? Key)>();
        var addedRowIndices = new List<int>();
        var removedRowIndices = new List<int>();
        if (useKey)
        {
            foreach (var kv in newKeyToIdx!)
                if (!currentKeyToIdx!.ContainsKey(kv.Key))
                    addedRowIndices.Add(newRows[kv.Value].RowIndex);
            foreach (var kv in currentKeyToIdx!)
            {
                if (!newKeyToIdx!.TryGetValue(kv.Key, out var ni))
                    removedRowIndices.Add(currentRows[kv.Value].RowIndex);
                else
                    pairs.Add((currentRows[kv.Value].RowIndex, kv.Value, ni, kv.Key));
            }
            pairs.Sort((a, b) => a.DisplayRow.CompareTo(b.DisplayRow));
        }
        else
        {
            var orderedCurrent = currentRows
                .Select((r, i) => (r, i))
                .OrderBy(x => x.r.RowIndex)
                .ToList();
            var orderedNew = newRows
                .Select((r, i) => (r, i))
                .OrderBy(x => x.r.RowIndex)
                .ToList();
            var matched = Math.Min(orderedCurrent.Count, orderedNew.Count);
            for (var i = 0; i < matched; i++)
                pairs.Add((orderedCurrent[i].r.RowIndex, orderedCurrent[i].i, orderedNew[i].i, null));
            for (var i = matched; i < orderedNew.Count; i++)
                addedRowIndices.Add(orderedNew[i].r.RowIndex);
            for (var i = matched; i < orderedCurrent.Count; i++)
                removedRowIndices.Add(orderedCurrent[i].r.RowIndex);
        }

        var changedPerColumn = new Dictionary<string, long>(StringComparer.Ordinal);
        var manualPerColumn = new Dictionary<string, long>(StringComparer.Ordinal);
        foreach (var (targetRaw, _, _) in commonPairs) { changedPerColumn[targetRaw] = 0; manualPerColumn[targetRaw] = 0; }

        var changes = new List<ReplacePreviewChange>();
        var changedRows = new HashSet<int>();
        long changedCells = 0;
        var manualOverwrite = 0;

        foreach (var (displayRow, ci, ni, key) in pairs)
        {
            ct.ThrowIfCancellationRequested();
            var cur = currentRows[ci].Data;
            var nxt = newRows[ni].Data;
            var curRowIndex = currentRows[ci].RowIndex;
            // Every cell is compared by COLUMN NAME (system header ↔ new-file
            // header), never by position — inserted/reordered columns only
            // affect their own column.
            foreach (var (targetRaw, newRaw, colIdx) in commonPairs)
            {
                cur.TryGetValue(targetRaw, out var cv);
                nxt.TryGetValue(newRaw, out var nv);
                cv ??= "";
                nv ??= "";
                if (string.Equals(cv, nv, StringComparison.Ordinal)) continue;
                changedCells++;
                changedPerColumn[targetRaw]++;
                changedRows.Add(displayRow);
                var wasEdited = editByCell.TryGetValue((curRowIndex, targetRaw), out var edit);
                if (wasEdited)
                {
                    manualOverwrite++;
                    manualPerColumn[targetRaw]++;
                }
                if (changes.Count < MaxSamples)
                {
                    changes.Add(new ReplacePreviewChange(
                        displayRow, targetRaw, colIdx,
                        Fit(cv), Fit(nv), wasEdited,
                        wasEdited ? edit.By : null,
                        wasEdited ? edit.At : null,
                        key));
                }
            }
        }

        // Manually-edited cells first so the "manual only" filter and bulk
        // "keep manual old" actions never lose rows beyond the first page.
        // Stable secondary order: row, then column.
        changes.Sort((a, b) =>
        {
            var m = b.WasManuallyEdited.CompareTo(a.WasManuallyEdited);
            if (m != 0) return m;
            var r = a.RowIndex.CompareTo(b.RowIndex);
            if (r != 0) return r;
            return a.ColumnIndex.CompareTo(b.ColumnIndex);
        });

        var columnStats = commonPairs.Select(p => new ReplacePreviewColumnStat(
            p.TargetRaw, p.ColumnIndex,
            changedPerColumn[p.TargetRaw],
            manualPerColumn[p.TargetRaw])).ToList();

        var summary = new ReplacePreviewSummary(
            currentRows.Count, newRows.Count, pairs.Count,
            addedRowIndices.Count, removedRowIndices.Count,
            (long)pairs.Count * commonPairs.Count,
            changedCells, changedRows.Count,
            pairs.Count - changedRows.Count,
            manualOverwrite, matchMode,
            changedCells > changes.Count);

        return new ReplacePreviewResponse(
            true, addedColumns, removedColumns,
            summary, columnStats, changes,
            addedRowIndices.Take(MaxRowSample).ToList(),
            removedRowIndices.Take(MaxRowSample).ToList(),
            changedCells > changes.Count,
            matchMode, nationalIdHeader, target.Version, newColumnStats,
            pendingEditCount, nextVersion);
    }

    private static string Fit(string value)
        => value.Length <= MaxValueLength ? value : value[..MaxValueLength] + "…";
}
