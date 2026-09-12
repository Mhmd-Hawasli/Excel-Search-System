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
                return new SearchPlan([], [], "", "", null);
            return new SearchPlan([custom],
                custom.Kind == "text" ? allTokens : [],
                custom.Kind == "numeric" ? numericNeedle : "",
                string.Join(" ", allTokens),
                categoryNeedle);
        }
        var hasText = textTokens.Count > 0;
        var hasNumbers = numericNeedle.Length > 0;
        var hasCategory = categoryNeedle is not null;
        return new SearchPlan(
            AllFields.Where(f =>
                (f.Kind == "text" && hasText)
                || (f.Kind == "numeric" && hasNumbers)
                || (f.Kind == "functional_category" && hasCategory)).ToList(),
            textTokens, numericNeedle, string.Join(" ", allTokens), categoryNeedle);
    }
}
