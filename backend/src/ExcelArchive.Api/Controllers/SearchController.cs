using ExcelArchive.Api.DTOs.Auth;
using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class SearchController(ISearchService search, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string? q, [FromQuery] string? mode = "full",
        [FromQuery] string? field = null, [FromQuery] string? groupIds = null, [FromQuery] string? fileIds = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        var user = await RequirePermissionAsync(Permissions.GroupsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var scope = await auth.ResolveDataScope(user);
        var request = new SearchRequest(q, mode, field, ParseGuids(groupIds), ParseGuids(fileIds), page, pageSize);
        return Ok(await search.SearchAsync(request, scope));
    }

    private static IReadOnlyList<Guid>? ParseGuids(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(Guid.Parse).ToList();
    }
}
