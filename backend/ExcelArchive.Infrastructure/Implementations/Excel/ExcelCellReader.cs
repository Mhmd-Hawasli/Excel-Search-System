using System.Globalization;
using ClosedXML.Excel;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>Thrown when a cell holds a value the reader cannot resolve to text.
/// Mirrors V1 UnresolvableCellError (Arabic message with sheet + address).</summary>
public sealed class UnresolvableCellException(string sheet, string address)
    : Exception($"الورقة «{sheet}»، الخلية {address}: تعذر قراءة قيمة الخلية (نوع غير مدعوم). أعد حفظ المصنف في Excel بصيغة .xlsx ثم أعد الرفع.")
{
}

/// <summary>Cell-to-text reader ported from V1 cell-value.ts onto ClosedXML.
/// Reads saved formula results (never expressions), preserves 0/false,
/// joins rich-text runs, keeps hyperlink display text. A formula whose saved
/// result is blank (not recalculated) or an error (#NAME?, #VALUE!, #DIV/0!,
/// …) reads as empty system-wide; a formula with a valid saved result reads
/// that value. Faulty formulas never fail an import.
/// </summary>
public static class ExcelCellReader
{
    public static string CellText(IXLCell cell)
    {
        var sheet = cell.Worksheet?.Name ?? "غير معروف";
        var address = cell.Address.ToString();
        try { address = cell.Address.ToString() ?? address; }
        catch { /* keep fallback */ }

        if (cell.HasFormula)
        {
            var cached = cell.CachedValue;
            if (cached.IsBlank || cached.IsError) return "";
            return ScalarText(cell, cached, sheet, address);
        }

        if (cell.HasRichText)
            return cell.GetRichText().Text;

        return ScalarText(cell, cell.Value, sheet, address);
    }

    private static string ScalarText(IXLCell cell, XLCellValue value, string sheet, string address)
    {
        if (value.IsBlank) return "";
        if (value.IsBoolean) return value.GetBoolean() ? "true" : "false";
        if (value.IsNumber)
        {
            var number = value.GetNumber();
            if (LooksLikeDate(cell)) return cell.GetFormattedString();
            // JS String(number) parity: integral values in safe range print fully
            // (16-digit identifiers), others use shortest round-trip form.
            if (number % 1 == 0 && Math.Abs(number) < 9e15)
                return number.ToString("F0", CultureInfo.InvariantCulture);
            return number.ToString("G", CultureInfo.InvariantCulture);
        }
        if (value.IsText) return value.GetText();
        if (value.IsDateTime || value.IsTimeSpan) return cell.GetFormattedString();
        if (value.IsError) return "";
        throw new UnresolvableCellException(sheet, address);
    }

    /// <summary>Numeric cells with a date number format are dates, mirroring
    /// ExcelJS which materializes them as Date values.</summary>
    private static bool LooksLikeDate(IXLCell cell)
    {
        try
        {
            var format = cell.Style.DateFormat.Format;
            return !string.IsNullOrEmpty(format) && format != "General";
        }
        catch { return false; }
    }
}
