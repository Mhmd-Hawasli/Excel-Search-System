namespace ExcelArchive.Domain.SheetMerge;

/// <summary>
/// Pure sheet-merge engine ported from V1 lib/sheet-merge/merge.ts.
/// First sheet is main; selected supplemental sheets merge in workbook
/// order via their first column; ≥8-digit normalized keys; per-sheet
/// valid/invalid/duplicate/missing/linked/unlinked statistics; 300-row
/// UI previews (exports carry all rows separately).
/// </summary>
public static class SheetMergeEngine
{
    public sealed record Built(
        SheetMergeStats Stats,
        List<string> GridHeaders, List<List<string>> GridRows,
        List<SheetRowFormats?> GridFormats,
        List<(string SheetName, IReadOnlyList<string> Headers, IReadOnlyList<UnlinkedRow> Rows)> UnlinkedSheets);

    private static double Percent(int part, int total)
    {
        if (total == 0) return 0;
        return Math.Round(part / (double)total * 1000) / 10;
    }

    public static List<UploadedSheet> ResolveLinkedSheets(UploadedWorkbook uploaded, IEnumerable<string> sheetNames)
    {
        var selected = sheetNames.Select(n => (n ?? "").Trim()).Where(n => n.Length > 0).Distinct().ToList();
        if (selected.Count == 0)
            throw new InvalidDataException("اختر صفحة واحدة على الأقل لدمجها مع الصفحة الأولى.");
        var linked = selected.Select(name =>
            uploaded.Sheets.FirstOrDefault(s => s.Name == name)
            ?? throw new InvalidDataException($"الصفحة «{name}» غير موجودة في المصنف.")).ToList();
        linked.Sort((a, b) => uploaded.Sheets.IndexOf(a).CompareTo(uploaded.Sheets.IndexOf(b)));
        foreach (var sheet in linked)
            if (sheet.Headers.Count < 2)
                throw new InvalidDataException(
                    $"الصفحة «{sheet.Name}»: يلزم الرقم الوطني في العمود الأول وعمود معلومات واحد على الأقل بعده.");
        return linked;
    }

    public static Built Build(
        UploadedWorkbook uploaded, int nationalIdColumn, IEnumerable<string> sheetNames,
        Action<int, string?>? onProgress = null)
    {
        var main = uploaded.Sheets.Count > 0 ? uploaded.Sheets[0] : null;
        if (main is null) throw new InvalidDataException("لا توجد صفحة رئيسية في المصنف.");
        if (nationalIdColumn < 0 || nationalIdColumn >= main.Headers.Count)
            throw new InvalidDataException("اختر عمود الرقم الوطني من الصفحة الأولى.");
        var linked = ResolveLinkedSheets(uploaded, sheetNames);

        onProgress?.Invoke(5, $"قراءة الصفحة الرئيسية «{main.Name}»…");
        var headers = new List<string>(main.Headers);
        foreach (var sheet in linked) headers.AddRange(sheet.Headers.Skip(1));
        var blankTail = Enumerable.Repeat("", headers.Count - main.Headers.Count).ToList();
        var gridRows = main.Rows.Select(r => new List<string>(r.Cells.Concat(blankTail))).ToList();
        var gridFormats = main.Rows.Select(r => r.Formats).ToList();
        var gridRowByKey = new Dictionary<string, int>(StringComparer.Ordinal);
        var mainUnlinked = new List<UnlinkedRow>();
        var mainInvalid = 0;
        var mainDuplicates = 0;

        string IdCell(UploadedSheetRow row, int index)
            => index >= 0 && index < row.Cells.Count ? row.Cells[index] ?? "" : "";

        // V1 keeps only the first 300 unlinked rows per sheet (preview AND
        // export). Docs/07.8 + 09 require full exports, so the engine keeps
        // every unlinked row for the exporter and slices 300 for UI stats.
        static void Collect(List<UnlinkedRow> all, UploadedSheetRow row, string value, string reason)
        {
            all.Add(new UnlinkedRow(row.RowNumber, value, reason, row.Cells.ToList(), row.Formats));
        }

        static IReadOnlyList<UnlinkedRow> PreviewOf(List<UnlinkedRow> all)
            => all.Take(SheetMergeLimits.UnlinkedPreviewLimit).ToList();

        var mainAll = new List<UnlinkedRow>();
        for (var mainIndex = 0; mainIndex < main.Rows.Count; mainIndex++)
        {
            var row = main.Rows[mainIndex];
            var raw = IdCell(row, nationalIdColumn);
            var reading = SheetMergeKey.ReadNationalId(raw);
            if (reading.Key is null)
            {
                mainInvalid++;
                Collect(mainAll, row, raw,
                    SheetMergeKey.IssueReason(reading.Issue ?? "empty", reading.Digits));
                continue;
            }
            if (gridRowByKey.TryGetValue(reading.Key, out var existing))
            {
                mainDuplicates++;
                Collect(mainAll, row, raw,
                    SheetMergeKey.DuplicateReason(main.Rows[existing].RowNumber));
                continue;
            }
            gridRowByKey[reading.Key] = mainIndex;
        }

        var matchedMainRows = new HashSet<int>();
        var stats = new List<SheetMergeSheetStat>();
        var unlinkedSheets = new List<(string, IReadOnlyList<string>, IReadOnlyList<UnlinkedRow>)>();
        var linkedOffset = main.Headers.Count;

        for (var index = 0; index < linked.Count; index++)
        {
            var sheet = linked[index];
            onProgress?.Invoke(15 + (int)Math.Round((index + 1) / (double)linked.Count * 70),
                $"ربط الصفحة «{sheet.Name}» ({index + 1} من {linked.Count})…");
            var all = new List<UnlinkedRow>();
            var rowByKey = new Dictionary<string, UploadedSheetRow>(StringComparer.Ordinal);
            var invalid = 0;
            var duplicates = 0;
            var missing = 0;
            var joined = 0;

            foreach (var row in sheet.Rows)
            {
                var raw = IdCell(row, 0);
                var reading = SheetMergeKey.ReadNationalId(raw);
                if (reading.Key is null)
                {
                    invalid++;
                    Collect(all, row, raw,
                        SheetMergeKey.IssueReason(reading.Issue ?? "empty", reading.Digits));
                    continue;
                }
                if (rowByKey.TryGetValue(reading.Key, out var previous))
                {
                    duplicates++;
                    Collect(all, row, raw,
                        SheetMergeKey.DuplicateReason(previous.RowNumber));
                    continue;
                }
                rowByKey[reading.Key] = row;
                if (!gridRowByKey.TryGetValue(reading.Key, out var target))
                {
                    missing++;
                    Collect(all, row, raw,
                        SheetMergeKey.MissingInMainReason(main.Name));
                    continue;
                }
                var extras = row.Cells.Skip(1).ToList();
                for (var c = 0; c < extras.Count && linkedOffset + c < gridRows[target].Count; c++)
                    gridRows[target][linkedOffset + c] = extras[c];
                var incoming = row.Formats;
                if (incoming is not null && (incoming.Fills.Count > 0 || incoming.Fonts.Count > 0))
                {
                    var baseFormats = gridFormats[target];
                    var fills = new Dictionary<string, string>(baseFormats?.Fills ?? new Dictionary<string, string>());
                    var fonts = new Dictionary<string, string>(baseFormats?.Fonts ?? new Dictionary<string, string>());
                    foreach (var kv in incoming.Fills)
                        if (int.TryParse(kv.Key, out var col) && col >= 1)
                            fills[(linkedOffset + col - 1).ToString()] = kv.Value;
                    foreach (var kv in incoming.Fonts)
                        if (int.TryParse(kv.Key, out var col) && col >= 1)
                            fonts[(linkedOffset + col - 1).ToString()] = kv.Value;
                    gridFormats[target] = new SheetRowFormats(fills, fonts);
                }
                matchedMainRows.Add(target);
                joined++;
            }

            stats.Add(new SheetMergeSheetStat(
                sheet.Name, "linked", sheet.Headers.Skip(1).ToList(), sheet.Headers.ToList(),
                sheet.Rows.Count, joined, Percent(joined, sheet.Rows.Count),
                rowByKey.Count, invalid, duplicates, missing, all.Count, PreviewOf(all)));
            if (all.Count > 0)
                unlinkedSheets.Add((sheet.Name, sheet.Headers.ToList(), all));
            linkedOffset += sheet.Headers.Count - 1;
        }

        onProgress?.Invoke(92, "احتساب نسب الربط…");
        var totalLinkedRows = stats.Sum(s => s.LinkedCount);
        var totalRows = stats.Sum(s => s.RowCount);
        var mainStat = new SheetMergeSheetStat(
            main.Name, "main", main.Headers.ToList(), main.Headers.ToList(),
            main.Rows.Count, matchedMainRows.Count, Percent(matchedMainRows.Count, main.Rows.Count),
            gridRowByKey.Count, mainInvalid, mainDuplicates, 0, mainAll.Count, PreviewOf(mainAll));
        if (mainAll.Count > 0)
            unlinkedSheets.Insert(0, (main.Name, main.Headers.ToList(), mainAll));
        onProgress?.Invoke(98, "تجهيز النتائج…");

        return new Built(
            new SheetMergeStats(
                uploaded.OriginalFilename, main.Name, nationalIdColumn,
                main.Headers[nationalIdColumn], headers.ToList(), gridRows.Count,
                Percent(totalLinkedRows, totalRows),
                new[] { mainStat }.Concat(stats).ToList()),
            headers.ToList(), gridRows, gridFormats, unlinkedSheets);
    }
}
