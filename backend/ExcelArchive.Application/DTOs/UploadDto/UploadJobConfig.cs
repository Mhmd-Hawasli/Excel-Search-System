using System.Text.Json;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Application.DTOs.UploadDto;

/// <summary>Validated upload-job payload. Mirrors V1 uploadConfigSchema
/// (name 2–160, desc ≤1000, filenames/sheet 1–255, positive sheetIndex,
/// non-negative totalRows, distinct linked sheets, ≥1 columns).
/// Replace jobs additionally carry fileId + mode (V1 runReplacementJob args).</summary>
public sealed record UploadJobConfig(
    Guid Token,
    Guid GroupId,
    string Name,
    string Description,
    string OriginalFilename,
    string SheetName,
    int SheetIndex,
    int TotalRows,
    IReadOnlyList<UploadJobColumn> Columns,
    string Mode,
    Guid? FileId,
    string? ReplaceMode,
    LinkedJobSheets? Linked)
{
    public static UploadJobConfig Parse(JsonDocument payload)
    {
        try
        {
            var root = payload.RootElement;
            var token = root.GetProperty("token").GetString();
            var groupId = root.GetProperty("groupId").GetGuid();
            var name = (root.TryGetProperty("name", out var n) ? n.GetString() : "")?.Trim() ?? "";
            var description = (root.TryGetProperty("description", out var d) ? d.GetString() : "")?.Trim() ?? "";
            var original = root.TryGetProperty("originalFilename", out var o) ? o.GetString() ?? "" : "";
            var sheet = root.TryGetProperty("sheetName", out var s) ? s.GetString() ?? "" : "";
            var sheetIndex = root.TryGetProperty("sheetIndex", out var si) && si.TryGetInt32(out var siv) ? siv : 1;
            var total = root.TryGetProperty("totalRows", out var t) && t.TryGetInt32(out var tv) ? tv : 0;
            var mode = root.TryGetProperty("mode", out var m) ? m.GetString() ?? "single" : "single";
            Guid? fileId = root.TryGetProperty("fileId", out var f) && f.ValueKind == JsonValueKind.String && Guid.TryParse(f.GetString(), out var fg) ? fg : null;
            string? replaceMode = root.TryGetProperty("replaceMode", out var rm) ? rm.GetString() : null;

            LinkedJobSheets? linked = null;
            if (root.TryGetProperty("linkedSheets", out var l) && l.ValueKind == JsonValueKind.Object)
            {
                var names = l.TryGetProperty("sheetNames", out var sn) && sn.ValueKind == JsonValueKind.Array
                    ? sn.EnumerateArray().Select(e => e.GetString() ?? "").Where(x => x.Length > 0).ToList()
                    : [];
                var key = l.TryGetProperty("nationalIdColumnIndex", out var k) && k.TryGetInt32(out var kv) ? kv : 0;
                linked = new LinkedJobSheets(names, key);
            }

            var columns = new List<UploadJobColumn>();
            if (root.TryGetProperty("columns", out var cols) && cols.ValueKind == JsonValueKind.Array)
            {
                foreach (var c in cols.EnumerateArray())
                {
                    var headerRaw = c.TryGetProperty("headerRaw", out var h) ? h.GetString() ?? "" : "";
                    var headerNormalized = c.TryGetProperty("headerNormalized", out var hn) ? hn.GetString() ?? "" : "";
                    var columnIndex = c.TryGetProperty("columnIndex", out var ci) && ci.TryGetInt32(out var civ) ? civ : 0;
                    StandardField? field = null;
                    if (c.TryGetProperty("standardField", out var sf) && sf.ValueKind == JsonValueKind.String)
                        field = StandardFieldKeys.Parse(sf.GetString());
                    Guid? categoryId = null;
                    if (c.TryGetProperty("categoryId", out var cat) && cat.ValueKind == JsonValueKind.String
                        && Guid.TryParse(cat.GetString(), out var cg))
                        categoryId = cg;
                    columns.Add(new UploadJobColumn(headerRaw, headerNormalized, columnIndex, field, categoryId));
                }
            }

            if (!Guid.TryParse(token, out var tokenGuid)
                || groupId == Guid.Empty
                || name.Length < 2 || name.Length > 160
                || description.Length > 1000
                || original.Length is < 1 or > 255
                || sheet.Length is < 1 or > 255
                || sheetIndex < 1 || total < 0
                || columns.Count == 0)
                throw new InvalidDataException("إعدادات مهمة الرفع غير صالحة.");
            return new UploadJobConfig(tokenGuid, groupId, name, description, original, sheet,
                sheetIndex, total, columns, mode, fileId, replaceMode, linked);
        }
        catch (InvalidDataException) { throw; }
        catch { throw new InvalidDataException("إعدادات مهمة الرفع غير صالحة."); }
    }
}

public sealed record UploadJobColumn(
    string HeaderRaw, string HeaderNormalized, int ColumnIndex,
    StandardField? StandardField, Guid? CategoryId);

public sealed record LinkedJobSheets(IReadOnlyList<string> SheetNames, int NationalIdColumnIndex);
