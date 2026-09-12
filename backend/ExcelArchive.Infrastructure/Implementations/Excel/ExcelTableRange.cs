using ClosedXML.Excel;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>
/// An Excel Table (Ctrl+T) found on a sheet. When a sheet carries a table,
/// every import reads ONLY the table and ignores all rows and columns outside
/// it; sheets without a table import normally. Ported from V1 table-range.ts.
/// All positions are 1-based.
/// </summary>
public sealed record SheetTableRange(
    int HeaderRow,
    int FirstRow,
    int LastRow,
    int FirstCol,
    int LastCol)
{
    public int DataRowCount => Math.Max(0, LastRow - FirstRow + 1);
    public int ColumnCount => LastCol - FirstCol + 1;
}

public static class ExcelTableRange
{
    /// <summary>Parses an A1-style range ("B2:D20", "$" prefixes tolerated).</summary>
    public static (int FirstRow, int LastRow, int FirstCol, int LastCol)? ParseTableRef(string? reference)
    {
        if (string.IsNullOrEmpty(reference)) return null;
        var match = System.Text.RegularExpressions.Regex.Match(
            reference.Replace("$", ""), @"^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$");
        if (!match.Success) return null;
        var firstCol = ColumnLettersToNumber(match.Groups[1].Value);
        var lastCol = ColumnLettersToNumber(match.Groups[3].Value);
        if (!int.TryParse(match.Groups[2].Value, out var firstRow)
            || !int.TryParse(match.Groups[4].Value, out var lastRow))
            return null;
        if (firstCol is null || lastCol is null || firstRow < 1 || lastRow < firstRow
            || firstCol < 1 || lastCol < firstCol)
            return null;
        return (firstRow, lastRow, firstCol.Value, lastCol.Value);
    }

    private static int? ColumnLettersToNumber(string letters)
    {
        if (letters.Length == 0) return null;
        var number = 0;
        foreach (var ch in letters.ToUpperInvariant())
        {
            if (ch is < 'A' or > 'Z') return null;
            number = number * 26 + (ch - 64);
        }
        return number;
    }

    /// <summary>Active table range of a worksheet (first table wins), or null
    /// when the sheet has no usable table. Totals row excluded; the first row
    /// is always treated as headers.</summary>
    public static SheetTableRange? ForSheet(IXLWorksheet ws)
    {
        var table = ws.Tables.FirstOrDefault();
        if (table is null) return null;
        // DataRange spans data AND the totals row; exclude totals explicitly.
        var data = table.DataRange;
        var headerCells = table.ShowHeaderRow ? table.HeadersRow() : null;
        var headerRow = table.ShowHeaderRow
            ? headerCells!.FirstCell().Address.RowNumber
            : data.FirstCell().Address.RowNumber;
        var firstCol = (table.ShowHeaderRow ? headerCells!.FirstCell() : data.FirstCell()).Address.ColumnNumber;
        var lastCol = (table.ShowHeaderRow ? headerCells!.LastCell() : data.LastCell()).Address.ColumnNumber;
        var lastRow = table.ShowTotalsRow
            ? data.LastCell().Address.RowNumber - 1
            : data.LastCell().Address.RowNumber;
        if (lastRow < headerRow) return null;
        return new SheetTableRange(headerRow, headerRow + 1, lastRow, firstCol, lastCol);
    }
}
