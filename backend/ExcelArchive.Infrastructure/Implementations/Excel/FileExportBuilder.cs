using System.Globalization;
using System.Text.RegularExpressions;
using ClosedXML.Excel;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>Archive file export ported from V1 file-export.ts: Excel Table
/// (TableStyleLight9), real date cells, source colors, edited-header
/// highlight, fitted widths, full-name history sheet, RTL views.</summary>
public sealed record ExportRecord(
    Guid Id, int RowIndex, Dictionary<string, string> Data,
    Dictionary<string, string>? Fills, Dictionary<string, string>? Fonts);

public sealed record ExportEdit(string RecordId, string HeaderRaw, string OldValue);

public static class FileExportBuilder
{
    private const string DateNumberFormat = "DD/MM/YYYY";
    private const double MaxColumnWidth = 200.0 / 7;
    private const double MinColumnWidth = 10;

    /// <summary>
    /// Excel cells hold at most 32,767 characters: longer values make
    /// ClosedXML throw ArgumentOutOfRangeException on save (surfacing as a
    /// generic export 500). Truncates safely without splitting a surrogate pair.
    /// </summary>
    public const int MaxCellTextLength = 32767;

    public static string FitCellText(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        if (value.Length <= MaxCellTextLength) return value;
        var end = MaxCellTextLength;
        if (char.IsHighSurrogate(value[end - 1])) end--;
        return value[..end];
    }

    /// <summary>Makes table column names unique/single-line/non-blank (V1 table-columns).</summary>
    public static List<string> UniqueTableColumnNames(IReadOnlyList<string> headers)
    {
        var used = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var result = new List<string>(headers.Count);
        for (var i = 0; i < headers.Count; i++)
        {
            var flattened = Regex.Replace(headers[i] ?? "", @"[\r\n\t]+", " ");
            var name = flattened.Trim().Length == 0 ? $"عمود {i + 1}" : flattened;
            var key = name.ToLowerInvariant();
            used.TryGetValue(key, out var count);
            used[key] = count + 1;
            result.Add(count == 0 ? name : $"{name} ({count + 1})");
        }
        return result;
    }

    private static int DisplayLength(string text)
    {
        var length = 0.0;
        foreach (var ch in text) length += ch > 255 ? 1.6 : 1;
        return (int)Math.Ceiling(length);
    }

    private static void ApplyColumnWidths(IXLWorksheet sheet, IReadOnlyList<string> headers, IReadOnlyList<IReadOnlyList<object>> rows)
    {
        for (var c = 0; c < headers.Count; c++)
        {
            var longest = DisplayLength(headers[c]);
            foreach (var row in rows)
            {
                if (c >= row.Count) continue;
                var cell = row[c];
                if (cell is null) continue;
                var text = cell is DateTime ? "31/12/2025" : cell.ToString() ?? "";
                if (text.Length == 0) continue;
                longest = Math.Max(longest, DisplayLength(text));
            }
            sheet.Column(c + 1).Width = Math.Min(MaxColumnWidth, Math.Max(MinColumnWidth, longest + 2));
        }
    }

    private static void StyleTableRange(IXLWorksheet sheet, int rowCount, int columnCount)
    {
        for (var r = 1; r <= rowCount + 1; r++)
        {
            var row = sheet.Row(r);
            row.Height = 30;
            for (var c = 1; c <= columnCount; c++)
            {
                var cell = row.Cell(c);
                cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                cell.Style.Alignment.WrapText = true;
                cell.Style.Border.TopBorder = XLBorderStyleValues.Thin;
                cell.Style.Border.LeftBorder = XLBorderStyleValues.Thin;
                cell.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
                cell.Style.Border.RightBorder = XLBorderStyleValues.Thin;
                cell.Style.Border.TopBorderColor = XLColor.FromHtml("#BFBFBF");
                cell.Style.Border.LeftBorderColor = XLColor.FromHtml("#BFBFBF");
                cell.Style.Border.BottomBorderColor = XLColor.FromHtml("#BFBFBF");
                cell.Style.Border.RightBorderColor = XLColor.FromHtml("#BFBFBF");
            }
        }
    }

    /// <summary>Parses DD/MM/YYYY or YYYY-MM-DD (validated) like V1 parseStoredDate.
    /// Years before 1900 stay text: Excel serial dates start at 1900 and
    /// ClosedXML throws OverflowException ("Not a legal OleAut date") when
    /// assigning earlier DateTimes to a cell (production merge/export 500).</summary>
    public static DateTime? ParseStoredDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var text = value.Trim();
        var m = Regex.Match(text, @"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$");
        if (m.Success && ValidExportDate(int.Parse(m.Groups[3].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[1].Value)))
            return new DateTime(int.Parse(m.Groups[3].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[1].Value));
        m = Regex.Match(text, @"^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$");
        if (m.Success && ValidExportDate(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value)))
            return new DateTime(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value));
        return null;
    }

    private static bool ValidExportDate(int year, int month, int day)
    {
        if (year < 1900 || year > 9999) return false;
        return ValidDate(year, month, day);
    }

    private static bool ValidDate(int year, int month, int day)
    {
        try
        {
            var d = new DateTime(year, month, day);
            return d.Year == year && d.Month == month && d.Day == day;
        }
        catch { return false; }
    }

    public static byte[] Build(string sheetName, IReadOnlyList<string> headers, IReadOnlyList<ExportRecord> records, IReadOnlyList<ExportEdit> edits)
    {
        var originals = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var edit in edits)
        {
            var key = edit.RecordId + "::" + edit.HeaderRaw;
            if (!originals.ContainsKey(key)) originals[key] = edit.OldValue;
        }
        var editedHeaders = new HashSet<string>(edits.Select(e => e.HeaderRaw), StringComparer.Ordinal);
        var headerIndex = headers.Select((h, i) => (h, i)).ToDictionary(x => x.h, x => x.i, StringComparer.Ordinal);

        using var workbook = new XLWorkbook();
        workbook.Properties.Author = "نظام أرشفة ملفات الإكسل";
        workbook.Properties.Created = DateTime.UtcNow;

        var safeName = string.IsNullOrWhiteSpace(sheetName) ? "البيانات" : sheetName;
        if (safeName.Length > 31) safeName = safeName[..31];
        var sheet = workbook.Worksheets.Add(safeName);

        var rows = new List<IReadOnlyList<object>>(records.Count);
        var dateCells = new List<(int Row, int Col)>();
        foreach (var record in records)
        {
            var rowIndex = rows.Count;
            var row = headers.Select((header, columnIndex) =>
            {
                var raw = record.Data.TryGetValue(header, out var v) ? v ?? "" : "";
                var parsed = raw.Length > 0 ? ParseStoredDate(raw) : null;
                if (parsed.HasValue)
                {
                    dateCells.Add((rowIndex, columnIndex));
                    return (object)parsed.Value;
                }
                return (object)raw;
            }).ToList();
            rows.Add(row);
        }

        var exportHeaders = UniqueTableColumnNames(headers);
        // Write cells BEFORE CreateTable (see MergeExportBuilder): creating
        // over an empty header row auto-names fields Column1..N and later
        // header writes trigger a colliding RenameField.
        for (var i = 0; i < exportHeaders.Count; i++)
            sheet.Cell(1, i + 1).Value = FitCellText(exportHeaders[i]);
        for (var r = 0; r < rows.Count; r++)
            for (var c = 0; c < headers.Count && c < rows[r].Count; c++)
            {
                var cell = sheet.Cell(r + 2, c + 1);
                if (rows[r][c] is DateTime dt) cell.Value = dt;
                else cell.Value = FitCellText(rows[r][c]?.ToString());
            }
        var table = sheet.Range(1, 1, rows.Count + 1, headers.Count).CreateTable("DataTable");
        table.Theme = XLTableTheme.TableStyleLight9;
        table.ShowRowStripes = false;
        table.ShowAutoFilter = true;

        var headerRow = sheet.Row(1);
        headerRow.Style.Font.Bold = true;
        headerRow.Style.Font.FontColor = XLColor.White;
        foreach (var (row, col) in dateCells)
            sheet.Cell(row + 2, col + 1).Style.DateFormat.Format = DateNumberFormat;

        foreach (var (record, index) in records.Select((r, i) => (r, i)))
        {
            var byIndex = new Dictionary<string, string>();
            foreach (var (header, argb) in FlattenFormats(record.Fills, headerIndex))
                byIndex[header] = argb;
            var rowFormats = new RowFormats(
                byIndex,
                FlattenFormats(record.Fonts, headerIndex).ToDictionary(kv => kv.Header, kv => kv.Argb));
            if (rowFormats.Fills.Count > 0 || rowFormats.Fonts.Count > 0)
                ApplyFormats(sheet, index + 2, rowFormats, headers.Count);
        }
        for (var i = 0; i < headers.Count; i++)
        {
            if (!editedHeaders.Contains(headers[i])) continue;
            var cell = headerRow.Cell(i + 1);
            cell.Style.Fill.PatternType = XLFillPatternValues.Solid;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#FFC000");
        }
        ApplyColumnWidths(sheet, exportHeaders, rows);
        StyleTableRange(sheet, rows.Count, headers.Count);

        if (edits.Count > 0)
        {
            var logHeaders = new[] { "صف Excel", "العمود", "القيمة الأصلية من Excel", "القيمة الحالية بعد التعديل" };
            var logRows = new List<IReadOnlyList<object>>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var record in records)
            {
                foreach (var header in editedHeaders)
                {
                    var key = record.Id + "::" + header;
                    if (!originals.TryGetValue(key, out var original) || !seen.Add(key)) continue;
                    record.Data.TryGetValue(header, out var current);
                    logRows.Add([record.RowIndex, header, original, current ?? ""]);
                }
            }
            var log = workbook.AddWorksheet("سجل التعديلات");
            for (var i = 0; i < logHeaders.Length; i++) log.Cell(1, i + 1).Value = logHeaders[i];
            for (var r = 0; r < logRows.Count; r++)
                for (var c = 0; c < logHeaders.Length; c++)
                {
                    var target = log.Cell(r + 2, c + 1);
                    if (logRows[r][c] is int number) target.Value = number;
                    else target.Value = FitCellText(logRows[r][c]?.ToString());
                }
            var logTable = log.Range(1, 1, logRows.Count + 1, logHeaders.Length).CreateTable("EditsTable");
            logTable.Theme = XLTableTheme.TableStyleLight9;
            logTable.ShowRowStripes = false;
            logTable.ShowAutoFilter = true;
            log.Row(1).Style.Font.Bold = true;
            log.Row(1).Style.Font.FontColor = XLColor.White;
            ApplyColumnWidths(log, logHeaders, logRows);
            StyleTableRange(log, logRows.Count, logHeaders.Length);
        }

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        return OpenXmlRtl.ApplyRightToLeft(ms.ToArray(),
            edits.Count > 0 ? [safeName, "سجل التعديلات"] : [safeName]);
    }

    private static List<(string Header, string Argb)> FlattenFormats(
        Dictionary<string, string>? byHeader, Dictionary<string, int> headerIndex)
    {
        var result = new List<(string Header, string Argb)>();
        if (byHeader is null) return result;
        foreach (var (header, argb) in byHeader)
        {
            if (headerIndex.TryGetValue(header, out var index) && argb is string s)
                result.Add((index.ToString(), s));
        }
        return result;
    }

    private static void ApplyFormats(IXLWorksheet sheet, int excelRowNumber, RowFormats formats, int columnCount)
    {
        var row = sheet.Row(excelRowNumber);
        for (var index = 0; index < columnCount; index++)
        {
            var key = index.ToString();
            formats.Fills.TryGetValue(key, out var fill);
            formats.Fonts.TryGetValue(key, out var font);
            if (fill is null && font is null)
                continue;
            var cell = row.Cell(index + 1);
            if (fill is not null)
            {
                cell.Style.Fill.PatternType = XLFillPatternValues.Solid;
                cell.Style.Fill.BackgroundColor = XLColor.FromHtml(fill);
            }
            if (font is not null)
                cell.Style.Font.FontColor = XLColor.FromHtml(font);
        }
    }
}
