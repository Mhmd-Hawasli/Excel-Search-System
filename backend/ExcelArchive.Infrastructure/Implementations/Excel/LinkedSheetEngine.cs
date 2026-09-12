using ClosedXML.Excel;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>Linked-sheets join ported from V1 linked-sheets.ts: first sheet is
/// main, supplemental sheets join on valid national IDs with strict
/// duplicate/orphan/invalid errors and header disambiguation.</summary>
public sealed record JoinedRow(int RowIndex, List<string> Values);

public static class LinkedSheetEngine
{
    private static List<JoinedRow> DataRows(IXLWorksheet ws, int width, SheetTableRange? table)
    {
        var rows = new List<JoinedRow>();
        var firstCol = table?.FirstCol ?? 1;
        foreach (var row in ws.RowsUsed())
        {
            var n = row.RowNumber();
            if (table is not null ? n <= table.HeaderRow || n > table.LastRow : n == 1) continue;
            var values = new List<string>(width);
            for (var i = 0; i < width; i++)
                values.Add(ExcelCellReader.CellText(row.Cell(firstCol + i)));
            rows.Add(new JoinedRow(n, values));
        }
        return rows;
    }

    public static (SheetInspection Inspection, List<JoinedRow> Rows) MergeLinkedSheets(
        XLWorkbook workbook, LinkedSheetsConfig config, IReadOnlyDictionary<string, SheetTableRange?>? tables = null)
    {
        if (workbook.Worksheets.Count == 0) throw new InvalidDataException("لا توجد ورقة أساسية في المصنف.");
        var primary = workbook.Worksheets.First();
        if (config.SheetNames.Count == 0
            || config.SheetNames.Distinct(StringComparer.Ordinal).Count() != config.SheetNames.Count
            || config.SheetNames.Contains(primary.Name, StringComparer.Ordinal))
            throw new InvalidDataException("اختر ورقة إضافية واحدة على الأقل، دون تكرار الورقة الأساسية.");

        tables ??= new Dictionary<string, SheetTableRange?>();
        tables.TryGetValue(primary.Name, out var primaryTable);
        primaryTable ??= ExcelTableRange.ForSheet(primary);
        var primaryHeaders = HeaderEngine.HeadersForSheet(primary, primaryTable);
        if (config.NationalIdColumnIndex < 1 || config.NationalIdColumnIndex > primaryHeaders.Count)
            throw new InvalidDataException("اختر عمود الرقم الوطني من الورقة الأساسية.");

        var additional = config.SheetNames.Select(name =>
            workbook.Worksheets.FirstOrDefault(w => w.Name == name)
                ?? throw new InvalidDataException($"الورقة «{name}» غير موجودة في المصنف.")).ToList();
        var order = workbook.Worksheets.ToList();
        additional.Sort((a, b) => order.IndexOf(a).CompareTo(order.IndexOf(b)));

        var rows = DataRows(primary, primaryHeaders.Count, primaryTable);
        var byNationalId = new Dictionary<string, JoinedRow>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            var raw = row.Values[config.NationalIdColumnIndex - 1];
            if (ArabicNormalizer.NationalIdIssue(raw) is not null) continue;
            var key = ArabicNormalizer.NationalIdDigits(raw)!;
            if (byNationalId.TryGetValue(key, out var previous))
                throw new InvalidDataException(
                    $"الورقة «{primary.Name}»: الرقم الوطني مكرر في الصفين {previous.RowIndex} و{row.RowIndex}؛ لا يمكن تحديد سجل الربط.");
            byNationalId[key] = row;
        }

        var columns = primaryHeaders.Select((h, i) => new InspectedColumn(
            h, ArabicNormalizer.NormalizeStored(h), i + 1,
            i + 1 == config.NationalIdColumnIndex ? "national_id"
                : HeaderEngine.SuggestStandardField(h) == "national_id" ? null : HeaderEngine.SuggestStandardField(h),
            primary.Name)).ToList();
        var usedHeaders = new HashSet<string>(columns.Select(c => c.HeaderNormalized), StringComparer.Ordinal);
        var linkedSummary = new List<LinkedSheetSummary>();

        foreach (var sheet in additional)
        {
            tables.TryGetValue(sheet.Name, out var sheetTable);
            sheetTable ??= ExcelTableRange.ForSheet(sheet);
            var headers = HeaderEngine.HeadersForSheet(sheet, sheetTable);
            if (headers.Count < 2)
                throw new InvalidDataException(
                    $"الورقة «{sheet.Name}»: يلزم الرقم الوطني في العمود الأول وعمود معلومات واحد على الأقل بعده.");
            var offset = columns.Count;
            foreach (var header in headers.Skip(1))
            {
                var headerRaw = header;
                var suffix = 1;
                while (!usedHeaders.Add(ArabicNormalizer.NormalizeStored(headerRaw)))
                {
                    headerRaw = $"{header} [{sheet.Name}]{(suffix > 1 ? $" ({suffix})" : "")}";
                    suffix++;
                }
                columns.Add(new InspectedColumn(
                    headerRaw, ArabicNormalizer.NormalizeStored(headerRaw), columns.Count + 1,
                    HeaderEngine.SuggestStandardField(header) == "national_id" ? null : HeaderEngine.SuggestStandardField(header),
                    sheet.Name));
            }
            foreach (var row in rows) row.Values.AddRange(Enumerable.Repeat("", headers.Count - 1));
            var seen = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (var extraRow in DataRows(sheet, headers.Count, sheetTable))
            {
                if (extraRow.Values.All(string.IsNullOrWhiteSpace)) continue;
                if (ArabicNormalizer.NationalIdIssue(extraRow.Values[0]) is not null)
                {
                    var firstCell = sheet.Row(extraRow.RowIndex).Cell(sheetTable?.FirstCol ?? 1);
                    var fromFormula = firstCell.HasFormula;
                    throw new InvalidDataException(
                        $"الورقة «{sheet.Name}»، الصف {extraRow.RowIndex}: {(fromFormula ? "نتيجة المعادلة المحفوظة في العمود الأول" : "القيمة في العمود الأول")} هي «{(string.IsNullOrEmpty(extraRow.Values[0]) ? "فارغة" : extraRow.Values[0])}». يجب أن تكون رقماً وطنياً صالحاً من 9 إلى 11 رقماً قبل تعبئة الأصفار.{(fromFormula ? " تأكد أن المعادلة ترجع الرقم الوطني وليس الرقم التسلسلي، ثم أعد حساب الملف واحفظه." : "")}");
                }
                var key = ArabicNormalizer.NationalIdDigits(extraRow.Values[0])!;
                if (seen.TryGetValue(key, out var firstRow))
                    throw new InvalidDataException(
                        $"الورقة «{sheet.Name}»: الرقم الوطني مكرر في الصفين {firstRow} و{extraRow.RowIndex}؛ اجعل لكل شخص صفاً واحداً في هذه الورقة.");
                if (!byNationalId.TryGetValue(key, out var target))
                    throw new InvalidDataException(
                        $"الورقة «{sheet.Name}»، الصف {extraRow.RowIndex}: الرقم الوطني غير موجود في الورقة الأساسية «{primary.Name}».");
                seen[key] = extraRow.RowIndex;
                for (var i = 1; i < extraRow.Values.Count; i++)
                    target.Values[offset + i - 1] = extraRow.Values[i];
            }
            linkedSummary.Add(new LinkedSheetSummary(sheet.Name, seen.Count,
                rows.Count(r => r.Values.Take(primaryHeaders.Count).Any(v => !string.IsNullOrWhiteSpace(v))) - seen.Count));
        }

        var unique = HeaderEngine.EnsureUniqueStandardFields(columns);
        var inspection = new SheetInspection(
            primary.Name, 1, rows.Count, unique.Count, unique,
            rows.Take(20).Select(r => (IReadOnlyList<string>)r.Values.AsReadOnly()).ToList(),
            new LinkedSheetsConfig(additional.Select(s => s.Name).ToList(), config.NationalIdColumnIndex),
            linkedSummary);
        return (inspection, rows);
    }
}
