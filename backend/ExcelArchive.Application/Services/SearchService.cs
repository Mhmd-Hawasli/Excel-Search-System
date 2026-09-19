using ExcelArchive.Application.DTOs.SearchDto;
using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Application.Services;

/// <summary>Search query engine: logical plan here, parameterized SQL in the repository.</summary>
public class SearchService(ISearchRepository search) : ISearchService
{
    private static readonly SearchField[] AllFields =
    [
        new("full_name", "text", "n_full_name"),
        new("national_id", "numeric", "d_national_id"),
        new("first_name", "text", "n_first_name"),
        new("father_name", "text", "n_father_name"),
        new("last_name", "text", "n_last_name"),
        new("mother_name", "text", "n_mother_name"),
        new("sham_cash", "numeric", "sf_sham_cash"),
        new("personal_no", "numeric", "d_personal_no"),
        new("phone", "numeric", "d_phone"),
        new("contract_code", "text", "n_contract_code"),
        new("secondary_contract_code", "text", "n_secondary_contract_code"),
        new("job_title", "text", "n_job_title"),
        new("functional_category", "functional_category", "sf_functional_category"),
        new("organizational_level", "text", "n_organizational_level"),
    ];

    private static readonly Dictionary<string, SearchField> ByKey =
        AllFields.ToDictionary(f => f.Key, StringComparer.Ordinal);

    public async Task<SearchResultSet> SearchAsync(SearchQuery query, CancellationToken ct = default)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Min(100, Math.Max(10, query.PageSize));
        var plan = BuildPlan(query);
        if (string.IsNullOrWhiteSpace(query.Query) || plan.Fields.Count == 0
            || query.AllowedFileIds is not null && query.AllowedFileIds.Count == 0)
            return new SearchResultSet([], 0, page, pageSize, 0);

        return await search.ExecuteAsync(plan, query.GroupIds, query.FileIds, query.AllowedFileIds,
            query.SortBy, query.SortDirection, page, pageSize, ct);
    }

    public async Task<IReadOnlyList<SearchResultRow>> SearchTopAsync(
        string field, string query,
        IReadOnlyList<Guid> groupIds, IReadOnlyList<Guid> fileIds,
        IReadOnlyList<Guid>? allowedFileIds, int take, CancellationToken ct = default)
    {
        if (field is null || !ByKey.ContainsKey(field))
            return [];
        var plan = BuildPlan(new SearchQuery(
            query, "custom", field, groupIds, fileIds, allowedFileIds, 1, 10, null, "asc"));
        if (string.IsNullOrWhiteSpace(query) || plan.Fields.Count == 0
            || allowedFileIds is not null && allowedFileIds.Count == 0)
            return [];

        return await search.ExecuteTopAsync(plan, groupIds, fileIds, allowedFileIds,
            Math.Clamp(take, 1, 100), ct);
    }

    private static SearchPlan BuildPlan(SearchQuery query)
    {
        var allTokens = ArabicNormalizer.NormalizeQuery(query.Query).ToList();
        var textTokens = allTokens.Where(t => t.Any(char.IsLetter)).ToList();
        var numericNeedle = ArabicNormalizer.DigitsOnly(query.Query);
        var categoryNeedle = FunctionalCategory.Query(query.Query);
        if (string.Equals(query.Mode, "custom", StringComparison.OrdinalIgnoreCase))
        {
            // Unknown custom fields cannot happen through the validated controller;
            // stay safe and match nothing rather than falling back to full mode.
            if (query.Field is null || !ByKey.TryGetValue(query.Field, out var custom))
                return new SearchPlan([], [], "", "", null, query.IncludeSimilar);
            return new SearchPlan([custom],
                custom.Kind == "text" ? allTokens : [],
                custom.Kind == "numeric" ? numericNeedle : "",
                string.Join(" ", allTokens),
                categoryNeedle,
                query.IncludeSimilar);
        }
        var hasText = textTokens.Count > 0;
        var hasNumbers = numericNeedle.Length > 0;
        // البحث العام (full): الاسم الثلاثي وتركيبه (اسم+أب+نسبة) والرقم
        // الوطني والشام كاش والرقم الذاتي فقط — باقي الحقول في المخصص.
        var fullFields = new List<SearchField>();
        if (hasText)
        {
            fullFields.Add(ByKey["full_name"]);
            fullFields.Add(new SearchField("name_parts", "text", ""));
        }
        if (hasNumbers)
        {
            fullFields.Add(ByKey["national_id"]);
            fullFields.Add(ByKey["sham_cash"]);
            fullFields.Add(ByKey["personal_no"]);
        }
        return new SearchPlan(
            fullFields,
            textTokens, numericNeedle, string.Join(" ", allTokens), categoryNeedle,
            query.IncludeSimilar);
    }
}
