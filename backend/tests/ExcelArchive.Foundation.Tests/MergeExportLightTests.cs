using ClosedXML.Excel;
using ExcelArchive.Domain.Merge;
using ExcelArchive.Domain.SheetMerge;
using ExcelArchive.Infrastructure.Implementations.Excel;

namespace ExcelArchive.Foundation.Tests;

/// <summary>Lightweight merge exports: empty cells stay blank (never
/// materialized, not even as invisible-char residue), no WrapText and no
/// fixed row heights (both hang Excel on big files), while sheet-merge
/// keeps the source colors (green stays green).</summary>
public sealed class MergeExportLightTests
{
    private static XLWorkbook Load(byte[] bytes) => new(new MemoryStream(bytes, writable: false));

    private static MergeRow Row(int n, string key, params string[] cells) => new()
    {
        RowNumber = n, Cells = cells.ToList(), Key = key, Rule = "full_name", Confirmed = true,
    };

    [Fact]
    public void TwoFileMerge_EmptyCellsBlank_NoWrap()
    {
        var headers = new[] { "الاسم", "الهاتف", "ملاحظات" };
        var left = new List<MergeRow> { Row(2, "0001", "أحمد", "", "  \u200B ") };
        var right = new List<MergeRow> { Row(2, "0001", "أحمد", "0999", "") };
        var bytes = MergeExportBuilder.Build(headers, left, headers, right, "confirmed");
        using var wb = Load(bytes);
        var full = wb.Worksheets.First(w => w.Name == MergeExportNames.SheetNames[0]);
        Assert.Equal("أحمد", full.Cell(2, 2).GetString());
        // Empty + invisible-only cells are genuinely blank, not hidden chars.
        Assert.True(full.Cell(2, 3).IsEmpty());
        Assert.True(full.Cell(2, 4).IsEmpty());
        // Perf: no wrap-text on big exports (hangs Excel while opening).
        Assert.False(full.Cell(2, 2).Style.Alignment.WrapText);
    }

    [Fact]
    public void SheetMerge_EmptyCellsBlank_NoWrap_KeepsSourceColors()
    {
        var stats = new SheetMergeStats("", "", 0, "", [], 0, 0, []);
        var built = new SheetMergeEngine.Built(
            stats,
            new List<string> { "الاسم", "الهاتف", "ملاحظات" },
            new List<List<string>> { new() { "أحمد", "", " \u200B " } },
            new List<SheetRowFormats?>
            {
                new(new Dictionary<string, string> { ["0"] = "#00FF00" },
                    new Dictionary<string, string>()),
            },
            new List<(string SheetName, IReadOnlyList<string> Headers, IReadOnlyList<UnlinkedRow> Rows)>());
        var bytes = SheetMergeExportBuilder.Build(built);
        using var wb = Load(bytes);
        var merged = wb.Worksheets.First(w => w.Name == SheetMergeLimits.MergedSheetName);
        Assert.Equal("أحمد", merged.Cell(2, 1).GetString());
        // Source green fill preserved on the merged row.
        Assert.Equal("FF00FF00",
            merged.Cell(2, 1).Style.Fill.BackgroundColor.Color.ToArgb().ToString("X8"));
        // Empty + invisible-only cells are genuinely blank.
        Assert.True(merged.Cell(2, 2).IsEmpty());
        Assert.True(merged.Cell(2, 3).IsEmpty());
        // Perf: no wrap-text on big exports (hangs Excel while opening).
        Assert.False(merged.Cell(2, 1).Style.Alignment.WrapText);
    }
}
