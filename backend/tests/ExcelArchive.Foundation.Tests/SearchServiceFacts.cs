using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.SearchDto;
using ExcelArchive.Application.Services;
using ExcelArchive.Infrastructure.Implementations.Repositories;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P3.1 service-level facts that need no database (short-circuits).</summary>
public sealed class SearchServiceFacts
{
    private static SearchService Svc() => new(new SearchRepository(TestHelpers.Config()));

    private static SearchQuery Q(
        string query = "احمد", string mode = "full", string? field = null,
        List<Guid>? groups = null, List<Guid>? files = null, List<Guid>? allowed = null,
        int page = 1, int pageSize = 25, string? sortBy = null, string direction = "asc")
        => new(query, mode, field, groups ?? [], files ?? [], allowed, page, pageSize, sortBy, direction);

    [Fact]
    public async Task EmptyQuery_ReturnsEmpty()
    {
        var r = await Svc().SearchAsync(Q("   "));
        Assert.Equal(0, r.Total);
        Assert.Empty(r.Rows);
        Assert.Equal(0, r.PageCount);
    }

    [Fact]
    public async Task EmptyAllowedFiles_ReturnsEmpty()
    {
        var r = await Svc().SearchAsync(Q("احمد", allowed: []));
        Assert.Equal(0, r.Total);
        Assert.Empty(r.Rows);
    }

    [Fact]
    public async Task UnknownCustomField_ReturnsEmpty()
    {
        var r = await Svc().SearchAsync(Q("احمد", mode: "custom", field: "nope"));
        Assert.Equal(0, r.Total);
        Assert.Empty(r.Rows);
    }

    [Fact]
    public async Task PageSize_Clamped_Page_Floored()
    {
        // Empty query short-circuits before any database access, so page
        // clamping is asserted without requiring a live PostgreSQL server.
        var r = await Svc().SearchAsync(Q("   ", page: -3, pageSize: 500));
        Assert.Equal(1, r.Page);
        Assert.Equal(100, r.PageSize);
    }
}
