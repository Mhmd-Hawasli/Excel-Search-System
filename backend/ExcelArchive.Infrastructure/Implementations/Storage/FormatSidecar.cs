using System.Text.Json;
using System.Text.Json.Serialization;

namespace ExcelArchive.Infrastructure.Implementations.Storage;

/// <summary>
/// Compact formatting sidecar written at inspection time (fills/fonts per row +
/// table bounds per sheet), mirroring V1 workbook.ts FormatSidecar. The import
/// never re-parses for styles; only rows carrying colors are stored.
/// </summary>
public sealed record FormatSidecar(
    int Version,
    List<string> Order,
    Dictionary<string, Dictionary<string, RowFormats>> Sheets,
    Dictionary<string, SheetTableRange?> Tables);

public static class FormatSidecarStore
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string Serialize(FormatSidecar sidecar) => JsonSerializer.Serialize(sidecar, Json);

    public static FormatSidecar? Deserialize(string json)
    {
        try
        {
            var parsed = JsonSerializer.Deserialize<FormatSidecar>(json, Json);
            return parsed is null || parsed.Version != 1 ? null : parsed;
        }
        catch { return null; }
    }

    /// <summary>Row formats of one Excel row of the selected sheet.</summary>
    public static RowFormats? RowFormats(FormatSidecar? sidecar, string? sheetName, int sheetIndex, int rowIndex)
    {
        if (sidecar is null) return null;
        var name = (sheetName is not null && sidecar.Sheets.ContainsKey(sheetName) ? sheetName : null)
            ?? (sheetIndex >= 1 && sheetIndex <= sidecar.Order.Count ? sidecar.Order[sheetIndex - 1] : null);
        if (name is null) return null;
        return sidecar.Sheets.TryGetValue(name, out var rows)
            && rows.TryGetValue(rowIndex.ToString(), out var formats) ? formats : null;
    }

    /// <summary>Active table of the selected sheet (null = plain sheet).</summary>
    public static SheetTableRange? TableRange(FormatSidecar? sidecar, string? sheetName, int sheetIndex)
    {
        if (sidecar is null) return null;
        var name = (sheetName is not null && sidecar.Sheets.ContainsKey(sheetName) ? sheetName : null)
            ?? (sheetIndex >= 1 && sheetIndex <= sidecar.Order.Count ? sidecar.Order[sheetIndex - 1] : null);
        if (name is null) return null;
        return sidecar.Tables.TryGetValue(name, out var table) ? table : null;
    }
}
