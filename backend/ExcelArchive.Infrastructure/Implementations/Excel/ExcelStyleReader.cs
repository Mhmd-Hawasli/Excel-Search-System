using System.Text.RegularExpressions;
using ClosedXML.Excel;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>Per-cell colors preserved by the system (fills + font colors only),
/// keyed by 0-based column index as strings, values 8-char ARGB.
/// Ported from V1 cell-style.ts.</summary>
public sealed record RowFormats(Dictionary<string, string> Fills, Dictionary<string, string> Fonts);

public static class ExcelStyleReader
{
    /// <summary>Default Office theme palette (theme1.xml order), like V1.</summary>
    private static readonly string[] ThemePalette =
    [
        "FFFFFF", "000000", "E7E6E6", "44546A", "5B9BD5", "ED7D31",
        "A5A5A5", "FFC000", "4472C4", "70AD47", "0563C1", "954F72",
    ];

    /// <summary>Normalizes any RGB/ARGB input to 8-char uppercase ARGB, or null.</summary>
    public static string? NormalizeArgb(object? value)
    {
        if (value is not string text) return null;
        var hex = text.Trim().TrimStart('#');
        if (Regex.IsMatch(hex, "^[0-9a-fA-F]{6}$")) return "FF" + hex.ToUpperInvariant();
        if (Regex.IsMatch(hex, "^[0-9a-fA-F]{8}$")) return hex.ToUpperInvariant();
        return null;
    }

    /// <summary>Resolves a theme color + tint to ARGB (simplified ECMA-376).</summary>
    public static string? ResolveThemeColor(int theme, double tint)
    {
        if (theme < 0 || theme >= ThemePalette.Length) return null;
        var amount = Math.Max(-1, Math.Min(1, double.IsFinite(tint) ? tint : 0));
        var channels = new int[3];
        for (var i = 0; i < 3; i++)
        {
            var value = Convert.ToInt32(ThemePalette[theme].Substring(i * 2, 2), 16);
            var adjusted = amount < 0 ? value * (1 + amount) : value * (1 - amount) + 255 * amount;
            channels[i] = Math.Max(0, Math.Min(255, (int)Math.Round(adjusted)));
        }
        return "FF" + string.Concat(channels.Select(c => c.ToString("X2")));
    }

    /// <summary>Resolves a ClosedXML color to ARGB. Explicit RGB wins; theme
    /// colors resolve against the default palette; indexed/unknown → null.</summary>
    public static string? ResolveColor(XLColor color)
    {
        if (color.ColorType == XLColorType.Color)
            return NormalizeArgb(color.Color.ToArgb().ToString("X8"));
        if (color.ColorType == XLColorType.Theme)
        {
            var theme = (int)color.ThemeColor;
            if (theme < 0 || theme >= ThemePalette.Length) return null;
            return ResolveThemeColor(theme, color.ThemeTint);
        }
        return null;
    }

    private static string? CellFill(IXLCell cell)
    {
        var fill = cell.Style.Fill;
        if (fill.PatternType == XLFillPatternValues.None) return null;
        return ResolveColor(fill.PatternColor) ?? ResolveColor(fill.BackgroundColor);
    }

    private static string? CellFontColor(IXLCell cell)
    {
        var color = cell.Style.Font.FontColor;
        // ClosedXML materializes the default font (automatic theme Text1) on
        // parsed cells; an un-tinted theme Text1 is indistinguishable from "no
        // explicit color", mirroring the V1 theme:1 skip rule. Theme index 1 is
        // Text1/dk1 in theme1.xml order.
        if (color.ColorType == XLColorType.Theme
            && (int)color.ThemeColor == 1
            && color.ThemeTint == 0)
            return null;
        return ResolveColor(color);
    }

    /// <summary>Extracts fills/fonts of the first `columnCount` cells. Never
    /// throws on exotic styles — unresolvable entries are skipped.</summary>
    public static RowFormats ExtractRowFormats(IXLRow row, int columnCount, int firstCol = 1)
    {
        var fills = new Dictionary<string, string>();
        var fonts = new Dictionary<string, string>();
        for (var index = 0; index < columnCount; index++)
        {
            try
            {
                var cell = row.Cell(firstCol + index);
                var fill = CellFill(cell);
                if (fill is not null) fills[index.ToString()] = fill;
                var font = CellFontColor(cell);
                if (font is not null) fonts[index.ToString()] = font;
            }
            catch { /* skip exotic style objects */ }
        }
        return new RowFormats(fills, fonts);
    }
}
