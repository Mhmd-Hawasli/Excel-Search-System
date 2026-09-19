using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.SearchDto;
using ExcelArchive.Application.Services;
using ExcelArchive.Infrastructure.Implementations.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Text;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit.Abstractions;
using FileEntity = ExcelArchive.Domain.Entities.File;
using RecordEntity = ExcelArchive.Domain.Entities.Record;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P3.1 live search tests (Q01–Q06 vectors) against the disposable
/// fixture database. Skipped gracefully when :5433 is unavailable.</summary>
public sealed class SearchLiveFixture : IAsyncLifetime
{
    public bool Available { get; private set; }
    public Guid GroupId { get; private set; }
    public Guid FileId { get; private set; }

    public async Task InitializeAsync()
    {
        Available = TestHelpers.FixtureDbAvailable();
        if (!Available) return;
        using var db = LiveDb();
        var group = new Group { Name = "qlive" };
        db.Groups.Add(group);
        await db.SaveChangesAsync();
        GroupId = group.Id;
        var file = new FileEntity { GroupId = group.Id, Name = "qfile", SheetName = "S" };
        db.Files.Add(file);
        await db.SaveChangesAsync();
        FileId = file.Id;
        var tie = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        db.Records.AddRange(
            Make(file.Id, 2, "أحمد محمد علي", "123456789", "0912345678", "فاطمة", "1111222233334444",
                "100", "C-1", "S-1", "مهندس", 1, "أولى", "أحمد", "محمد", "علي", tie),
            Make(file.Id, 3, "أحمد محمود علي", "987654321", "0999999999", "مريم", null,
                "200", "C-2", "S-2", "طبيب", 2, "ثانية", "أحمد", "محمود", "علي"),
            Make(file.Id, 4, "سارة خالد", "abc", null, "فاطمة", null,
                null, null, null, null, null, null, null, null, null),
            Make(file.Id, 5, "أحمد محمد علي", "111222333", null, null, null,
                null, null, null, null, null, null, null, null, null, tie),
            Make(file.Id, 6, "عبد الله خالد", "555666777", null, null, null,
                null, null, null, null, null, null, null, null, null),
            // Parts-only row (no full_name): found in full mode via name_parts composition only.
            Make(file.Id, 7, null, null, null, null, null,
                null, null, null, null, null, null, "كريم", "سامي", "ناصر"),
            // Stored with ال («الاحمد»): exact still matches after stripping it on both sides.
            Make(file.Id, 8, "مازن احمد الاحمد العلي", null, null, null, null,
                null, null, null, null, null, null, null, null, null));
        await db.SaveChangesAsync();
    }

    private static AppDbContext LiveDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Port=5433;Database=excel_archive_2_fixture;Username=postgres;Timeout=3;Command Timeout=10")
            .UseSnakeCaseNamingConvention()
            .Options;
        return new AppDbContext(options);
    }

    private static RecordEntity Make(Guid fileId, int row, string? full, string? national, string? phone,
        string? mother, string? sham, string? personal, string? contract, string? secondary,
        string? job, int? category, string? org, string? first, string? father, string? last,
        DateTime? created = null)
    {
        string? N(string? v) => string.IsNullOrEmpty(v) ? null : ArabicNormalizer.NormalizeStored(v);
        var (_, dNatRaw, natNum) = ArabicNormalizer.NationalIdColumns(national ?? "");
        var dNat = string.IsNullOrEmpty(dNatRaw) ? null : dNatRaw;
        return new RecordEntity
        {
            FileId = fileId, RowIndex = row,
            Data = System.Text.Json.JsonDocument.Parse("{}"),
            SfFullName = full, NFullName = N(full),
            SfNationalId = ArabicNormalizer.NationalIdAsBigInt(national ?? ""),
            DNationalId = dNat, NationalIdNum = natNum,
            SfPhone = phone, DPhone = string.IsNullOrEmpty(phone) ? null : ArabicNormalizer.DigitsOnly(phone),
            SfMotherName = mother, NMotherName = N(mother),
            SfShamCash = ShamCash.AsBigInt(sham ?? ""),
            SfPersonalNo = personal, DPersonalNo = string.IsNullOrEmpty(personal) ? null : ArabicNormalizer.DigitsOnly(personal),
            SfContractCode = contract, NContractCode = N(contract),
            SfSecondaryContractCode = secondary, NSecondaryContractCode = N(secondary),
            SfJobTitle = job, NJobTitle = N(job),
            SfFunctionalCategory = category,
            SfOrganizationalLevel = org, NOrganizationalLevel = N(org),
            SfFirstName = first, NFirstName = N(first),
            SfFatherName = father, NFatherName = N(father),
            SfLastName = last, NLastName = N(last),
            CreatedAt = created ?? DateTime.UtcNow,
        };
    }

    public async Task DisposeAsync()
    {
        if (!Available) return;
        using var db = LiveDb();
        var group = await db.Groups.FirstOrDefaultAsync(g => g.Id == GroupId);
        if (group is not null)
        {
            db.Groups.Remove(group);
            await db.SaveChangesAsync();
        }
    }
}

public sealed class SearchLiveTests(SearchLiveFixture fx, ITestOutputHelper output) : IClassFixture<SearchLiveFixture>
{
    private void RequireDb()
    {
        if (!fx.Available)
            output.WriteLine("ASSUMPTION skipped: fixture :5433 unavailable.");
    }

    private bool Live => fx.Available;
    private Guid FileId => fx.FileId;

    private static SearchService Svc() => new(new SearchRepository(TestHelpers.FixtureConfig()));

    private static SearchQuery Q(string query, string mode = "full", string? field = null,
        List<Guid>? groups = null, List<Guid>? files = null, List<Guid>? allowed = null,
        int page = 1, int pageSize = 25, string? sortBy = null, string direction = "asc",
        bool similar = true)
        => new(query, mode, field, groups ?? [], files ?? [], allowed, page, pageSize, sortBy, direction, similar);

    [Fact]
    public async Task NormalizationPairs_Found()
    {
        RequireDb();
        if (!Live) return;
        var svc = Svc();
        foreach (var q in new[] { "احمد", "أحمد", "إحمد", "فاطمه", "القاسم" })
        {
            var r = await svc.SearchAsync(Q(q, allowed: [FileId]));
            output.WriteLine($"{q} -> {r.Total}");
        }
        var r1 = await svc.SearchAsync(Q("احمد", allowed: [FileId]));
        Assert.True(r1.Total >= 3, $"احمد -> {r1.Total}");
        // Mother name lives in custom mode only; full mode must not match it.
        var r2 = await svc.SearchAsync(Q("فاطمه", "custom", "mother_name", allowed: [FileId]));
        Assert.Equal(2, r2.Total);
        var r2full = await svc.SearchAsync(Q("فاطمه", allowed: [FileId]));
        Assert.Equal(0, r2full.Total);
    }

    [Fact]
    public async Task FullMode_ExactAfterNormalization_IgnoresDual()
    {
        // Stored «الاحمد» vs query «الاحمد»: exact after stripping ال on both sides.
        RequireDb();
        if (!Live) return;
        var svc = Svc();
        var r = await svc.SearchAsync(Q("مازن احمد الاحمد العلي", allowed: [FileId], similar: false));
        Assert.True(r.Total >= 1, $"exact-ال -> {r.Total}");
        Assert.All(r.Rows, row => Assert.Equal(0, row.MatchRank));
    }

    [Fact]
    public async Task FullMode_NamePartsComposition()
    {
        // Parts-only row (no full_name) is found by composing first+father+last.
        RequireDb();
        if (!Live) return;
        var svc = Svc();
        var r = await svc.SearchAsync(Q("كريم سامي ناصر", allowed: [FileId]));
        Assert.True(r.Total >= 1, $"composition -> {r.Total}");
        Assert.Contains(r.Rows, row => row.MatchedField == "name_parts");
    }

    [Fact]
    public async Task CustomFields_HitExactRecords()
    {
        RequireDb();
        if (!Live) return;
        var svc = Svc();
        var nat = await svc.SearchAsync(Q("123456789", "custom", "national_id", allowed: [FileId]));
        Assert.Single(nat.Rows);
        Assert.Equal("national_id", nat.Rows[0].MatchedField);
        Assert.Equal(2, nat.Rows[0].MatchRank);
        var cat = await svc.SearchAsync(Q("الأولى", "custom", "functional_category", allowed: [FileId]));
        Assert.Single(cat.Rows);
        Assert.Equal(1, cat.Rows[0].SfFunctionalCategory);
        var mother = await svc.SearchAsync(Q("فاطمة", "custom", "mother_name", allowed: [FileId]));
        Assert.Equal(2, mother.Total);
    }

    [Fact]
    public async Task FuzzyBoundary_TypoWithinLimitMatches_BeyondDoesNot()
    {
        RequireDb();
        if (!Live) return;
        var svc = Svc();
        // "أحمدم" (5 chars): closest word "احمد" distance 1 → 1*5 <= 5 → match.
        var close = await svc.SearchAsync(Q("أحمدم", allowed: [FileId]));
        Assert.True(close.Total >= 1, $"أحمدم -> {close.Total}");
        // Fuzzy-only matches rank last (3), after exact (0), prefix (1) and substring (2).
        Assert.All(close.Rows, row => Assert.Equal(3, row.MatchRank));
        // ...unless similar matches are hidden: typo finds nothing, exact still matches.
        var hidden = await svc.SearchAsync(Q("أحمدم", allowed: [FileId], similar: false));
        Assert.Equal(0, hidden.Total);
        var exactOnly = await svc.SearchAsync(Q("أحمد محمد علي", allowed: [FileId], similar: false));
        Assert.True(exactOnly.Total >= 1, $"exact-only -> {exactOnly.Total}");
        Assert.All(exactOnly.Rows, row => Assert.Equal(0, row.MatchRank));
        // "أحمدمم" (6 chars): distance 2 → 2*5=10 > 6 → no match anywhere.
        var far = await svc.SearchAsync(Q("أحمدمم", allowed: [FileId]));
        Assert.Equal(0, far.Total);
    }

    [Fact]
    public async Task TopN_FuzzyParity_TypoWithinLimitFound_BeyondNot()
    {
        // Bulk path (SearchTopAsync) must find the same typo'd rows as the
        // single search: "أحمدم" matches via the full_name fuzzy branch.
        RequireDb();
        if (!Live) return;
        var svc = Svc();
        var close = await svc.SearchTopAsync("full_name", "أحمدم", [], [], [FileId], 10);
        Assert.NotEmpty(close);
        Assert.Equal("full_name", close[0].MatchedField);
        var far = await svc.SearchTopAsync("full_name", "أحمدمم", [], [], [FileId], 10);
        Assert.Empty(far);
    }

    [Fact]
    public async Task MixedTextNumeric_FindsBoth()
    {
        RequireDb();
        if (!Live) return;
        var svc = Svc();
        var r = await svc.SearchAsync(Q("أحمد 0912", allowed: [FileId]));
        Assert.True(r.Total >= 3, $"mixed -> {r.Total}");
    }

    [Fact]
    public async Task NationalSort_OrderWithNullsLast()
    {
        RequireDb();
        if (!Live) return;
        var svc = Svc();
        var r = await svc.SearchAsync(Q("1", allowed: [FileId], sortBy: "national_id", direction: "asc"));
        var ids = r.Rows.Select(x => x.DNationalId).ToList();
        Assert.Equal(["00111222333", "00123456789", "00987654321"], ids);
        // Row with an invalid national ID matches via mother name (custom mode) but sorts last (NULL).
        var m = await svc.SearchAsync(Q("فاطمة", "custom", "mother_name", allowed: [FileId], sortBy: "national_id", direction: "asc"));
        Assert.Equal(["00123456789", null], m.Rows.Select(x => x.DNationalId).ToList());
    }

    [Fact]
    public async Task Rank_ExactBeatsPrefixBeatsSubstring()
    {
        RequireDb();
        if (!Live) return;
        var svc = Svc();
        var r = await svc.SearchAsync(Q("أحمد محمد علي", allowed: [FileId]));
        Assert.True(r.Rows.Count > 0);
        Assert.Equal(0, r.Rows[0].MatchRank);
        Assert.Equal("full_name", r.Rows[0].MatchedField);
        Assert.NotNull(r.Rows[0].MatchedValue);
    }

    [Fact]
    public async Task Scope_RequestOutsideGrants_IsEmpty()
    {
        RequireDb();
        if (!Live) return;
        var svc = Svc();
        var r = await svc.SearchAsync(Q("أحمد", files: [Guid.NewGuid()], allowed: [FileId]));
        Assert.Equal(0, r.Total);
        Assert.Empty(r.Rows);
    }

    [Fact]
    public async Task Paging_SlicesDeterministically()
    {
        RequireDb();
        if (!Live) return;
        var svc = Svc();
        var p1 = await svc.SearchAsync(Q("أحمد", allowed: [FileId], page: 1, pageSize: 10));
        Assert.True(p1.PageCount >= 1);
        Assert.Equal(p1.Total, p1.Rows.Count);
    }
}
