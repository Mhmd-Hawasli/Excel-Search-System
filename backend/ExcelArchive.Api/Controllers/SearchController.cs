using ExcelArchive.Application.Common;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.SearchDto;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class SearchController(ISearchService search, IAuthService auth) : ApiControllerBase(auth)
{
    private static readonly HashSet<string> Modes = new(StringComparer.Ordinal) { "full", "custom" };
    private static readonly HashSet<string> Fields = new(StringComparer.Ordinal)
    {
        "first_name", "father_name", "last_name", "full_name", "national_id", "sham_cash",
        "personal_no", "mother_name", "phone", "contract_code", "secondary_contract_code",
        "job_title", "functional_category", "organizational_level",
    };
    private static readonly HashSet<string> SortKeys = new(StringComparer.Ordinal)
    {
        "source", "full_name", "national_id", "mother_name", "sham_cash", "personal_no",
        "job_title", "functional_category", "organizational_level", "match",
    };
    private static readonly HashSet<string> Directions = new(StringComparer.Ordinal) { "asc", "desc" };

    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] string? q,
        [FromQuery] string? mode = "full",
        [FromQuery] string? field = null,
        [FromQuery(Name = "groupId")] string[]? groupIds = null,
        [FromQuery(Name = "fileId")] string[]? fileIds = null,
        [FromQuery] string? page = null,
        [FromQuery] string? pageSize = null,
        [FromQuery] string? sortBy = null,
        [FromQuery] string? sortDirection = "asc")
    {
        // search.view is derived from groups.view / groups.viewScoped (see AuthService),
        // so scoped users can search within their files; scope is enforced in SQL.
        var user = await RequirePermissionAsync(Permissions.SearchView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();

        var query = (q ?? "").Trim();
        if (query.Length > 200) return Bad("معايير البحث غير صالحة.");
        var normalizedMode = (mode ?? "full").Trim().ToLowerInvariant();
        if (!Modes.Contains(normalizedMode)) return Bad("معايير البحث غير صالحة.");
        string? normalizedField = null;
        if (normalizedMode == "custom")
        {
            normalizedField = (field ?? "").Trim().ToLowerInvariant();
            if (!Fields.Contains(normalizedField)) return Bad("اختر حقل البحث المخصص.");
        }
        var groups = ParseUuids(groupIds, out var groupsValid);
        var files = ParseUuids(fileIds, out var filesValid);
        if (!groupsValid || !filesValid) return Bad("معايير البحث غير صالحة.");
        int pageNum = 1, sizeNum = 25;
        if (page is not null && (!int.TryParse(page, out pageNum) || pageNum < 1))
            return Bad("معايير البحث غير صالحة.");
        if (pageSize is not null && (!int.TryParse(pageSize, out sizeNum) || sizeNum is < 10 or > 100))
            return Bad("معايير البحث غير صالحة.");
        var normalizedSort = string.IsNullOrWhiteSpace(sortBy) ? null : sortBy.Trim().ToLowerInvariant();
        if (normalizedSort is not null && !SortKeys.Contains(normalizedSort)) return Bad("معايير البحث غير صالحة.");
        var direction = (sortDirection ?? "asc").Trim().ToLowerInvariant();
        if (!Directions.Contains(direction)) return Bad("معايير البحث غير صالحة.");

        var scope = await Auth.ResolveDataScope(user);
        var scoped = ApplySearchScope(groups, files, scope);
        if (scoped is null)
            return Ok(ApiResponse.Success(new
            {
                rows = Array.Empty<object>(), total = 0, page = pageNum, pageSize = sizeNum, pageCount = 0,
            }));
        var result = await search.SearchAsync(new SearchQuery(
            query, normalizedMode, normalizedField, scoped.Groups, scoped.Files,
            scoped.Allowed, pageNum, sizeNum, normalizedSort, direction));
        return Ok(ApiResponse.Success(new
        {
            rows = result.Rows, total = result.Total, page = result.Page,
            pageSize = result.PageSize, pageCount = result.PageCount,
        }));
    }

    private static List<Guid> ParseUuids(string[]? values, out bool valid)
    {
        valid = true;
        var result = new List<Guid>();
        var seen = new HashSet<Guid>();
        foreach (var raw in values ?? [])
        {
            if (!Guid.TryParse(raw?.Trim(), out var id)) { valid = false; return []; }
            if (seen.Add(id)) result.Add(id);
        }
        return result;
    }

    /// <summary>Intersects requested filters with the authorized scope (V1 scope.ts).
    /// Null means nothing is searchable: callers render an empty result.</summary>
    private sealed record ScopedFilters(List<Guid> Groups, List<Guid> Files, List<Guid>? Allowed);

    private static ScopedFilters? ApplySearchScope(List<Guid> requestedGroups, List<Guid> requestedFiles, DataScopeDto scope)
    {
        if (scope.GroupIds is null) return new ScopedFilters(requestedGroups, requestedFiles, null);
        var allowedGroups = new HashSet<Guid>(scope.GroupIds);
        var allowedFiles = new HashSet<Guid>(scope.FileIds ?? []);
        var groups = requestedGroups.Count > 0
            ? requestedGroups.Where(allowedGroups.Contains).ToList()
            : requestedFiles.Count > 0 ? [] : allowedGroups.ToList();
        var files = requestedFiles.Count > 0
            ? requestedFiles.Where(allowedFiles.Contains).ToList()
            : requestedGroups.Count > 0 ? [] : allowedFiles.ToList();
        if (groups.Count == 0 && files.Count == 0) return null;
        return new ScopedFilters(groups, files, allowedFiles.ToList());
    }
}
