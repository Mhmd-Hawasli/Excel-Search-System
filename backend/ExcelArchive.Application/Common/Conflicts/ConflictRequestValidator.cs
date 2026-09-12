using ExcelArchive.Application.DTOs.ConflictDto;
using ExcelArchive.Domain.Conflicts;

namespace ExcelArchive.Application.Common.Conflicts;

public static class ConflictRequestValidator
{
    public const string InvalidMessage =
        "معايير التصفية غير صالحة. اختر الحالة والحقل والحالة الفرعية من القائمة.";

    public static bool TryParse(
        string? category, string? field, string? rule,
        string? page, string? pageSize, string? sortBy, string? sortDir,
        out ValidConflictRequest? request)
    {
        request = null;
        var normalizedCategory = string.IsNullOrWhiteSpace(category) ? "invalid" : category.Trim();
        if (!ConflictCatalog.Categories.Any(c => c.Key == normalizedCategory)) return false;
        var normalizedField = string.IsNullOrWhiteSpace(field) ? "all" : field.Trim();
        if (normalizedField != "all" && !ConflictCatalog.Fields.Any(f => f.Key == normalizedField)) return false;
        var normalizedRule = string.IsNullOrWhiteSpace(rule) ? "all" : rule.Trim();
        if (normalizedRule != "all" && !ConflictCatalog.ByKey.ContainsKey(normalizedRule)) return false;

        var pageNum = 1;
        if (page is not null && (!int.TryParse(page.Trim(), out pageNum) || pageNum is < 1 or > 1_000_000)) return false;
        var sizeNum = 25;
        if (pageSize is not null && (!int.TryParse(pageSize.Trim(), out sizeNum) || sizeNum is < 10 or > 100)) return false;

        var normalizedSort = string.IsNullOrWhiteSpace(sortBy) ? "issueNumber" : sortBy.Trim();
        if (!ConflictCatalog.Sortable.Contains(normalizedSort)) return false;
        var normalizedDir = string.IsNullOrWhiteSpace(sortDir) ? "asc" : sortDir.Trim().ToLowerInvariant();
        if (normalizedDir is not ("asc" or "desc")) return false;

        // V1 superRefine: field/rule must belong to the selected category.
        var matching = ConflictCatalog.Rules.Where(r =>
            r.Category == normalizedCategory &&
            (normalizedField == "all" || r.Field == normalizedField));
        if (!matching.Any()) return false;
        if (normalizedRule != "all" && !matching.Any(r => r.Key == normalizedRule)) return false;

        request = new ValidConflictRequest(
            normalizedCategory, normalizedField, normalizedRule,
            pageNum, sizeNum, normalizedSort, normalizedDir);
        return true;
    }
}
