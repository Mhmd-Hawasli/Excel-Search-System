using System.Text.Json;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Application.Services;

/// <summary>Applies per-cell "keep the old value" choices during a replace
/// import: the new workbook's value is swapped for the currently stored one
/// before shadows/quality are computed, so kept cells survive the update as
/// if the file had carried the old value. Row identity mirrors the preview:
/// national-id key when available, else Excel row number. Header matching is
/// by column NAME on both sides.</summary>
public sealed record KeepOldPlan(
    Dictionary<string, Dictionary<string, string>> ByRow,
    string? NationalHeader);

public static class KeepOldApplier
{
    public static KeepOldPlan Build(
        IReadOnlyList<Record> oldRecords,
        IReadOnlyList<FileColumn> targetColumns,
        IReadOnlyList<UploadJobColumn> newColumns,
        IReadOnlyList<KeepOldCell> keep)
    {
        var targetNormByRaw = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var c in targetColumns)
            targetNormByRaw.TryAdd(c.HeaderRaw, c.HeaderNormalized);
        var newRawByNorm = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var c in newColumns)
            newRawByNorm.TryAdd(c.HeaderNormalized, c.HeaderRaw);
        var oldNationalRaw = targetColumns
            .FirstOrDefault(c => c.StandardField == StandardField.NationalId)?.HeaderRaw;
        var newNationalRaw = newColumns
            .FirstOrDefault(c => c.StandardField == StandardField.NationalId)?.HeaderRaw;

        var oldByRow = new Dictionary<int, Dictionary<string, string>>();
        var oldByKey = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
        foreach (var r in oldRecords)
        {
            var data = RowMap(r.Data);
            data["pk"] = (r.Pk ?? r.RowIndex).ToString(System.Globalization.CultureInfo.InvariantCulture);
            oldByRow.TryAdd(r.RowIndex, data);
            oldByKey.TryAdd(data["pk"], data);
            if (oldNationalRaw is not null
                && data.TryGetValue(oldNationalRaw, out var nv)
                && ArabicNormalizer.NationalIdDigits(nv) is string digits)
                oldByKey.TryAdd(digits, data);
        }

        var byRow = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
        foreach (var k in keep)
        {
            if (!targetNormByRaw.TryGetValue(k.HeaderRaw, out var norm)) continue;
            if (!newRawByNorm.TryGetValue(norm, out var newRaw)) continue;
            Dictionary<string, string>? oldData = null;
            string? rowKey = null;
            if (k.MatchKey is not null)
            {
                if (oldByKey.TryGetValue(k.MatchKey, out oldData))
                    rowKey = "k:" + k.MatchKey;
            }
            else if (oldByRow.TryGetValue(k.RowIndex, out oldData))
            {
                rowKey = "r:" + k.RowIndex;
            }
            if (rowKey is null || oldData is null) continue;
            oldData.TryGetValue(k.HeaderRaw, out var oldValue);
            if (!byRow.TryGetValue(rowKey, out var cells))
                byRow[rowKey] = cells = new Dictionary<string, string>(StringComparer.Ordinal);
            cells[newRaw] = oldValue ?? "";
        }
        return new KeepOldPlan(byRow, newColumns.FirstOrDefault(c =>
            string.Equals(c.HeaderRaw, "pk", StringComparison.OrdinalIgnoreCase))?.HeaderRaw ?? newNationalRaw);
    }

    public static void Apply(KeepOldPlan plan, Dictionary<string, string> data, int excelRowIndex)
    {
        // Exclusive identity (mirrors the preview): a national-id key hit
        // wins and returns immediately, otherwise fall back to the row index.
        // Applying both would let a stale positional entry overwrite the
        // correct keyed value when the workbook is reordered.
        if (plan.NationalHeader is not null
            && data.TryGetValue(plan.NationalHeader, out var nv)
            && ArabicNormalizer.NationalIdDigits(nv) is string digits
            && plan.ByRow.TryGetValue("k:" + digits, out var byKey))
        {
            foreach (var (header, value) in byKey)
                data[header] = value;
            return;
        }
        if (string.Equals(plan.NationalHeader, "pk", StringComparison.OrdinalIgnoreCase))
            return;
        if (plan.ByRow.TryGetValue("r:" + excelRowIndex, out var byRow))
            foreach (var (header, value) in byRow)
                data[header] = value;
    }

    private static Dictionary<string, string> RowMap(JsonDocument? doc)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        if (doc is null || doc.RootElement.ValueKind != JsonValueKind.Object) return map;
        foreach (var p in doc.RootElement.EnumerateObject())
            map[p.Name] = p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() ?? ""
                : p.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ? ""
                : p.Value.GetRawText();
        return map;
    }
}
