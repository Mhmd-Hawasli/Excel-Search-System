using System.Text.Json;
using ExcelArchive.Application.Services;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Common.Conflicts;
using ExcelArchive.Application.DTOs.ConflictDto;
using ExcelArchive.Domain.Conflicts;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;
using FileEntity = ExcelArchive.Domain.Entities.File;
using RecordEntity = ExcelArchive.Domain.Entities.Record;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P4.2: invalid11/missing9/similar2 engines with positive/negative
/// fixtures per docs/07.6 + manifest C001–C058 (P4.2 subset). Conflicting 36
/// stays P4.3; ignore/cache/export/UI stay P4.4/P4.5.</summary>
public sealed class ConflictP42Tests
{
    private static readonly DateOnly Today = new(2026, 9, 9);

    private static ConflictEngine.EngineRow Row(
        string? national = null, string? sham = null, string? personal = null,
        string? mother = null, string? full = null, string? first = null,
        string? father = null, string? last = null, string? job = null,
        string? phone = null, string? functional = null, int? sfCategory = null,
        string[]? mapped = null, (string Header, string Value)[]? dates = null,
        string display = "")
    {
        var map = (mapped ?? ["national_id", "sham_cash", "personal_no", "mother_name",
            "full_name", "first_name", "father_name", "last_name", "job_title", "phone"])
            .ToHashSet(StringComparer.Ordinal);
        var headers = map.ToDictionary(k => k, k => $"h_{k}", StringComparer.Ordinal);
        var cells = (dates ?? []).Select(d => new ConflictEngine.DateCell(d.Header, d.Value)).ToList();
        return new ConflictEngine.EngineRowWithHeaders(
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "f", "o.xlsx", 2,
            display != "" ? display : full ?? "",
            mother ?? "", national ?? "", sham ?? "", personal ?? "",
            full ?? "", first ?? "", father ?? "", last ?? "",
            job ?? "", phone ?? "", functional ?? "", sfCategory,
            map, cells, headers);
    }

    private static bool Has(IReadOnlyList<ConflictEngine.EngineIssue> issues, string rule)
        => issues.Any(i => i.Rule == rule);

    // ---- invalid11 ----

    [Fact]
    public void NationalShort_Positive_Negative()
    {
        Assert.True(Has(ConflictEngine.EvaluateInvalidMissing(Row(national: "12345678"), Today), "national_short"));
        Assert.False(Has(ConflictEngine.EvaluateInvalidMissing(Row(national: "123456789"), Today), "national_short"));
    }

    [Fact]
    public void NationalLong_Positive_Negative()
    {
        Assert.True(Has(ConflictEngine.EvaluateInvalidMissing(Row(national: "123456789012"), Today), "national_long"));
        Assert.False(Has(ConflictEngine.EvaluateInvalidMissing(Row(national: "12345678901"), Today), "national_long"));
    }

    [Fact]
    public void NationalCharacters_Positive_Negative()
    {
        Assert.True(Has(ConflictEngine.EvaluateInvalidMissing(Row(national: "12345A789"), Today), "national_characters"));
        Assert.False(Has(ConflictEngine.EvaluateInvalidMissing(Row(national: "123456789"), Today), "national_characters"));
        // Empty does not flag characters (missing covers it when mapped).
        Assert.False(Has(ConflictEngine.EvaluateInvalidMissing(Row(national: ""), Today), "national_characters"));
    }

    [Fact]
    public void ShamShortLongCharacters()
    {
        Assert.True(Has(ConflictEngine.EvaluateInvalidMissing(Row(sham: "123456789012345"), Today), "sham_short"));
        Assert.False(Has(ConflictEngine.EvaluateInvalidMissing(Row(sham: "1234567890123456"), Today), "sham_short"));
        Assert.True(Has(ConflictEngine.EvaluateInvalidMissing(Row(sham: "12345678901234567"), Today), "sham_long"));
        Assert.False(Has(ConflictEngine.EvaluateInvalidMissing(Row(sham: "1234567890123456"), Today), "sham_long"));
        Assert.True(Has(ConflictEngine.EvaluateInvalidMissing(Row(sham: "1234AB8901234567"), Today), "sham_characters"));
        Assert.False(Has(ConflictEngine.EvaluateInvalidMissing(Row(sham: "1234567890123456"), Today), "sham_characters"));
        // Non-numeric short flags BOTH short and characters (V1 multi-issue rows).
        var both = ConflictEngine.EvaluateInvalidMissing(Row(sham: "12AB"), Today);
        Assert.True(Has(both, "sham_short"));
        Assert.True(Has(both, "sham_characters"));
    }

    [Fact]
    public void NameMismatch_MappedOnly()
    {
        var bad = Row(full: "أحمد محمد علي", first: "أحمد", father: "محمود", last: "علي");
        Assert.True(Has(ConflictEngine.EvaluateInvalidMissing(bad, Today), "name_mismatch"));
        var good = Row(full: "أحمد محمد علي", first: "أحمد", father: "محمد", last: "علي");
        Assert.False(Has(ConflictEngine.EvaluateInvalidMissing(good, Today), "name_mismatch"));
        // Unmapped file never raises name_mismatch even with mismatched values.
        var unmapped = Row(full: "أحمد محمد علي", first: "أحمد", father: "محمود", last: "علي",
            mapped: ["national_id"]);
        Assert.False(Has(ConflictEngine.EvaluateInvalidMissing(unmapped, Today), "name_mismatch"));
    }

    [Fact]
    public void CategoryInvalid_ZeroOnly()
    {
        Assert.True(Has(ConflictEngine.EvaluateInvalidMissing(
            Row(functional: "xyz", sfCategory: 0), Today), "category_invalid"));
        Assert.False(Has(ConflictEngine.EvaluateInvalidMissing(
            Row(functional: "الأولى", sfCategory: 1), Today), "category_invalid"));
        Assert.False(Has(ConflictEngine.EvaluateInvalidMissing(
            Row(functional: "", sfCategory: null), Today), "category_invalid"));
    }

    [Fact]
    public void Dates_InvalidEarlyFuture_ContractEndExcluded()
    {
        var invalid = Row(dates: [("تاريخ الميلاد", "not-a-date")]);
        Assert.True(Has(ConflictEngine.EvaluateInvalidMissing(invalid, Today), "date_invalid"));

        var valid = Row(dates: [("تاريخ الميلاد", "2000-01-01")]);
        var v = ConflictEngine.EvaluateInvalidMissing(valid, Today);
        Assert.False(Has(v, "date_invalid"));
        Assert.False(Has(v, "date_early"));
        Assert.False(Has(v, "date_future"));

        var early = Row(dates: [("تاريخ الميلاد", "01/01/1939")]);
        Assert.True(Has(ConflictEngine.EvaluateInvalidMissing(early, Today), "date_early"));

        var future = Row(dates: [("تاريخ الميلاد", "2100-01-01")]);
        Assert.True(Has(ConflictEngine.EvaluateInvalidMissing(future, Today), "date_future"));

        // Contract end dates legitimately lie in the future (V1 exclusion).
        var contractEnd = Row(dates: [("تاريخ نهاية العقد", "2100-01-01")]);
        Assert.False(Has(ConflictEngine.EvaluateInvalidMissing(contractEnd, Today), "date_future"));
        // ...but invalid/early contract dates still count.
        var contractBad = Row(dates: [("تاريخ نهاية العقد", "oops")]);
        Assert.True(Has(ConflictEngine.EvaluateInvalidMissing(contractBad, Today), "date_invalid"));
    }

    // ---- missing9 ----

    [Theory]
    [InlineData("missing_national", "national_id")]
    [InlineData("missing_sham", "sham_cash")]
    [InlineData("missing_personal", "personal_no")]
    [InlineData("missing_mother", "mother_name")]
    [InlineData("missing_full", "full_name")]
    [InlineData("missing_first", "first_name")]
    [InlineData("missing_father", "father_name")]
    [InlineData("missing_last", "last_name")]
    [InlineData("missing_job", "job_title")]
    public void Missing_MappedEmpty_Flags_UnmappedOrFilled_Clean(string rule, string field)
    {
        static string? Val(string field) => field switch
        {
            "national_id" => "national", "sham_cash" => "sham", "personal_no" => "personal",
            "mother_name" => "mother", "full_name" => "full", "first_name" => "first",
            "father_name" => "father", "last_name" => "last", "job_title" => "job",
            _ => null,
        };
        ConflictEngine.EngineRow Empty(string f)
        {
            var kw = new Dictionary<string, string?> { ["national"] = "123456789", ["sham"] = "1234567890123456",
                ["personal"] = "p1", ["mother"] = "أم", ["full"] = "أ ب ج", ["first"] = "أ",
                ["father"] = "ب", ["last"] = "ج", ["job"] = "مهندس" };
            kw[Val(f)!] = "";
            return Row(national: kw["national"], sham: kw["sham"], personal: kw["personal"],
                mother: kw["mother"], full: kw["full"], first: kw["first"],
                father: kw["father"], last: kw["last"], job: kw["job"]);
        }
        Assert.True(Has(ConflictEngine.EvaluateInvalidMissing(Empty(field), Today), rule));

        // Filled value is clean (for this rule).
        var filled = Row(national: "123456789", sham: "1234567890123456", personal: "p1",
            mother: "أم", full: "أ ب ج", first: "أ", father: "ب", last: "ج", job: "مهندس");
        Assert.False(Has(ConflictEngine.EvaluateInvalidMissing(filled, Today), rule));

        // Unmapped field never flags even when empty.
        var unmapped = Row(national: "", sham: "", personal: "", mother: "", full: "",
            first: "", father: "", last: "", job: "", mapped: ["phone"]);
        Assert.False(Has(ConflictEngine.EvaluateInvalidMissing(unmapped, Today), rule));
    }

    // ---- similar2 ----

    [Fact]
    public void SimilarNames_SameNameDifferentMothers_Flags()
    {
        var a = Row(full: "أحمد محمد علي", mother: "فاطمة", display: "أحمد محمد علي");
        var b = Row(full: "أحمد محمد علي", mother: "مريم", display: "أحمد محمد علي");
        var sim = ConflictEngine.EvaluateSimilar([a, b]);
        Assert.True(sim.ContainsKey(a.Id) && sim[a.Id].Any(i => i.Rule == "similar_names"));
        Assert.True(sim.ContainsKey(b.Id) && sim[b.Id].Any(i => i.Rule == "similar_names"));

        var c = Row(full: "أحمد محمد علي", mother: "فاطمة", display: "أحمد محمد علي");
        var d = Row(full: "أحمد محمد علي", mother: "فاطمة", display: "أحمد محمد علي");
        Assert.Empty(ConflictEngine.EvaluateSimilar([c, d]));
    }

    [Fact]
    public void SimilarNational_SameNameDifferentIds_Flags()
    {
        var a = Row(full: "سارة خالد", national: "123456789", display: "سارة خالد");
        var b = Row(full: "سارة خالد", national: "987654321", display: "سارة خالد");
        var sim = ConflictEngine.EvaluateSimilar([a, b]);
        Assert.True(sim.ContainsKey(a.Id) && sim[a.Id].Any(i => i.Rule == "similar_national"));

        var c = Row(full: "سارة خالد", national: "123456789", display: "سارة خالد");
        var d = Row(full: "سارة خالد", national: "123456789", display: "سارة خالد");
        Assert.Empty(ConflictEngine.EvaluateSimilar([c, d]));
    }

    // ---- service: grouping/sort/page/scope/conflicting-empty ----

    private static (AppDbContext Db, ConflictService Svc, Guid FileId) SetupService()
    {
        var db = TestHelpers.InMemoryDb();
        var group = new Group { Name = "cg" + Guid.NewGuid().ToString("N")[..6] };
        db.Groups.Add(group);
        db.SaveChanges();
        var file = new FileEntity
        {
            GroupId = group.Id, Name = "cf" + Guid.NewGuid().ToString("N")[..6],
            OriginalFilename = "o.xlsx", SheetName = "S",
        };
        db.Files.Add(file);
        db.SaveChanges();
        var cols = new[]
        {
            new FileColumn { FileId = file.Id, HeaderRaw = "h_national", HeaderNormalized = "h_national", ColumnIndex = 1, StandardField = StandardField.NationalId },
            new FileColumn { FileId = file.Id, HeaderRaw = "h_full", HeaderNormalized = "h_full", ColumnIndex = 2, StandardField = StandardField.FullName },
            new FileColumn { FileId = file.Id, HeaderRaw = "h_mother", HeaderNormalized = "h_mother", ColumnIndex = 3, StandardField = StandardField.MotherName },
            new FileColumn { FileId = file.Id, HeaderRaw = "h_first", HeaderNormalized = "h_first", ColumnIndex = 4, StandardField = StandardField.FirstName },
            new FileColumn { FileId = file.Id, HeaderRaw = "h_father", HeaderNormalized = "h_father", ColumnIndex = 5, StandardField = StandardField.FatherName },
            new FileColumn { FileId = file.Id, HeaderRaw = "h_last", HeaderNormalized = "h_last", ColumnIndex = 6, StandardField = StandardField.LastName },
        };
        db.FileColumns.AddRange(cols);
        db.SaveChanges();
        return (db, TestHelpers.ConflictSvc(db), file.Id);
    }

    private static void AddRecord(AppDbContext db, Guid fileId, int row,
        string national, string full, string mother,
        string first = "", string father = "", string last = "")
    {
        var data = new Dictionary<string, string>
        {
            ["h_national"] = national, ["h_full"] = full, ["h_mother"] = mother,
            ["h_first"] = first, ["h_father"] = father, ["h_last"] = last,
        };
        db.Records.Add(new RecordEntity
        {
            FileId = fileId, RowIndex = row,
            Data = JsonDocument.Parse(JsonSerializer.Serialize(data)),
            SfFullName = full, SfNationalId = Domain.Text.ArabicNormalizer.NationalIdAsBigInt(national),
            SfMotherName = mother, SfFirstName = first, SfFatherName = father, SfLastName = last,
            DNationalId = Domain.Text.ArabicNormalizer.NormalizeNationalId(national),
        });
        db.SaveChanges();
    }

    private static ValidConflictRequest Req(string category, string field = "all", string rule = "all",
        int page = 1, int pageSize = 25, string sortBy = "issueNumber", string sortDir = "asc")
        => new(category, field, rule, page, pageSize, sortBy, sortDir);

    private static DataScopeDto OpenScope() => new() { GroupIds = null, FileIds = null };

    [Fact]
    public async Task Service_InvalidListsV1Shape_WithPageCount()
    {
        var (db, svc, fileId) = SetupService();
        AddRecord(db, fileId, 2, "123", "أحمد محمد علي", "فاطمة", "أحمد", "محمد", "علي");
        AddRecord(db, fileId, 3, "123456789", "سارة خالد", "مريم");

        var r = await svc.ListAsync(Req("invalid", "national_id", "national_short"), OpenScope());
        Assert.Equal(1, r.Total);
        Assert.Equal(1, r.PageCount);
        var row = Assert.Single(r.Rows);
        Assert.Equal("national_short", Assert.Single(row.Issues).Rule);
        Assert.Equal(row.Id.ToString(), row.GroupKey);
        Assert.Equal(1, row.IssueNumber);
        Assert.Equal("cf", row.FileName[..2]);
    }

    [Fact]
    public async Task Service_MissingAndPagination()
    {
        var (db, svc, fileId) = SetupService();
        AddRecord(db, fileId, 2, "", "أ ب", "أم");
        AddRecord(db, fileId, 3, "", "ج د", "أم");
        AddRecord(db, fileId, 4, "123456789", "هـ و", "أم");

        var p1 = await svc.ListAsync(Req("missing", "national_id", "missing_national", 1, 10), OpenScope());
        Assert.Equal(2, p1.Total);
        Assert.Equal(1, p1.PageCount);
        Assert.Equal(2, p1.Rows.Count);

        var single = await svc.ListAsync(Req("missing", "national_id", "missing_national", 1, 10, "fileName", "asc"), OpenScope());
        Assert.Equal(2, single.Total);
    }

    [Fact]
    public async Task Service_SimilarSharesGroupKeyDenseRank()
    {
        var (db, svc, fileId) = SetupService();
        AddRecord(db, fileId, 2, "123456789", "أحمد محمد علي", "فاطمة");
        AddRecord(db, fileId, 3, "987654321", "أحمد محمد علي", "مريم");
        AddRecord(db, fileId, 4, "555666777", "سارة خالد", "نور");

        var r = await svc.ListAsync(Req("similar", "all", "similar_national"), OpenScope());
        Assert.Equal(2, r.Total);
        Assert.Equal(r.Rows[0].GroupKey, r.Rows[1].GroupKey);
        Assert.Equal(r.Rows[0].IssueNumber, r.Rows[1].IssueNumber);
    }

    [Fact]
    public async Task Service_ConflictingEmptyUntilP43_ScopeEmptyIsEmpty()
    {
        var (db, svc, fileId) = SetupService();
        AddRecord(db, fileId, 2, "123", "أحمد", "فاطمة");
        var c = await svc.ListAsync(Req("conflicting"), OpenScope());
        Assert.Equal(0, c.Total);
        Assert.Empty(c.Rows);

        var empty = await svc.ListAsync(Req("invalid"),
            new DataScopeDto { GroupIds = [], FileIds = [] });
        Assert.Equal(0, empty.Total);
    }

    [Fact]
    public async Task Service_IgnoredPairHidesOnlyThatRule()
    {
        var (db, svc, fileId) = SetupService();
        // sham "12AB": flags sham_short + sham_characters (multi-issue row).
        var file = db.Files.First(f => f.Id == fileId);
        var shamCol = new FileColumn
        {
            FileId = fileId, HeaderRaw = "h_sham", HeaderNormalized = "h_sham",
            ColumnIndex = 7, StandardField = StandardField.ShamCash,
        };
        db.FileColumns.Add(shamCol);
        db.SaveChanges();
        var data = new Dictionary<string, string>
        {
            ["h_national"] = "123456789", ["h_full"] = "أ ب ج", ["h_mother"] = "أم",
            ["h_first"] = "أ", ["h_father"] = "ب", ["h_last"] = "ج", ["h_sham"] = "12AB",
        };
        var rec = new RecordEntity
        {
            FileId = fileId, RowIndex = 2,
            Data = JsonDocument.Parse(JsonSerializer.Serialize(data)),
            SfFullName = "أ ب ج", SfMotherName = "أم",
            SfNationalId = Domain.Text.ArabicNormalizer.NationalIdAsBigInt("123456789"),
        };
        db.Records.Add(rec);
        db.SaveChanges();

        var before = await svc.ListAsync(Req("invalid", "sham_cash", "all"), OpenScope());
        var target = Assert.Single(before.Rows);
        Assert.Equal(2, target.Issues.Count);

        // P4.4: ignore through the service so the cache revision bumps
        // (direct inserts bypass revision on providers without triggers).
        await svc.IgnoreAsync("sham_short", rec.Id,
            new DataScopeDto { GroupIds = null, FileIds = null });

        var after = await svc.ListAsync(Req("invalid", "sham_cash", "all"), OpenScope());
        var kept = Assert.Single(after.Rows);
        Assert.Single(kept.Issues);
        Assert.Equal("sham_characters", kept.Issues[0].Rule);
    }
}

/// <summary>P4.2 live smoke on the disposable fixture DB (:5433, jsonb).
/// Skipped gracefully when the fixture DB is unavailable.</summary>
public sealed class ConflictP42LiveFixture : IAsyncLifetime
{
    public bool Available { get; private set; }
    public Guid GroupId { get; private set; }
    public Guid FileId { get; private set; }

    public async Task InitializeAsync()
    {
        Available = TestHelpers.FixtureDbAvailable();
        if (!Available) return;
        using var db = LiveDb();
        var group = new Group { Name = "c42live" + Guid.NewGuid().ToString("N")[..6] };
        db.Groups.Add(group);
        await db.SaveChangesAsync();
        GroupId = group.Id;
        var file = new FileEntity
        {
            GroupId = group.Id, Name = "c42f" + Guid.NewGuid().ToString("N")[..6],
            OriginalFilename = "o.xlsx", SheetName = "S",
        };
        db.Files.Add(file);
        await db.SaveChangesAsync();
        FileId = file.Id;
        db.FileColumns.AddRange(
            new FileColumn { FileId = file.Id, HeaderRaw = "h_national", HeaderNormalized = "h_national", ColumnIndex = 1, StandardField = StandardField.NationalId },
            new FileColumn { FileId = file.Id, HeaderRaw = "h_full", HeaderNormalized = "h_full", ColumnIndex = 2, StandardField = StandardField.FullName },
            new FileColumn { FileId = file.Id, HeaderRaw = "h_mother", HeaderNormalized = "h_mother", ColumnIndex = 3, StandardField = StandardField.MotherName });
        await db.SaveChangesAsync();
        void Add(int row, string national, string full, string mother)
        {
            var data = new Dictionary<string, string>
            {
                ["h_national"] = national, ["h_full"] = full, ["h_mother"] = mother,
            };
            db.Records.Add(new RecordEntity
            {
                FileId = file.Id, RowIndex = row,
                Data = JsonDocument.Parse(JsonSerializer.Serialize(data)),
                SfFullName = full, SfMotherName = mother,
                SfNationalId = Domain.Text.ArabicNormalizer.NationalIdAsBigInt(national),
                DNationalId = Domain.Text.ArabicNormalizer.NormalizeNationalId(national),
            });
        }
        Add(2, "123", "أحمد محمد علي", "فاطمة");
        Add(3, "123456789", "سارة خالد", "مريم");
        await db.SaveChangesAsync();
    }

    public static AppDbContext LiveDb()
    {
        var options = new Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Port=5433;Database=excel_archive_2_fixture;Username=postgres;Timeout=3;Command Timeout=10")
            .UseSnakeCaseNamingConvention()
            .Options;
        return new AppDbContext(options);
    }

    public async Task DisposeAsync()
    {
        if (!Available) return;
        using var db = LiveDb();
        var group = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(db.Groups, g => g.Id == GroupId);
        if (group is not null)
        {
            db.Groups.Remove(group);
            await db.SaveChangesAsync();
        }
    }
}

public sealed class ConflictP42LiveTests(ConflictP42LiveFixture fx) : IClassFixture<ConflictP42LiveFixture>
{
    [Fact]
    public async Task Live_InvalidShort_ReturnsV1Shape()
    {
        if (!fx.Available) return;
        using var db = ConflictP42LiveFixture.LiveDb();
        var svc = TestHelpers.ConflictSvc(db);
        var scope = new DataScopeDto { GroupIds = null, FileIds = null };
        // Narrow to the live fixture file via scope would need grants; instead
        // assert the engine finds our short id among global results.
        var r = await svc.ListAsync(
            new ValidConflictRequest("invalid", "national_id", "national_short", 1, 100, "issueNumber", "asc"),
            scope);
        Assert.True(r.Total >= 1);
        Assert.True(r.PageCount >= 1);
        Assert.Contains(r.Rows, row => row.Issues.Any(i => i.Rule == "national_short"));
        var sample = r.Rows.First(row => row.Issues.Any(i => i.Rule == "national_short"));
        Assert.False(string.IsNullOrWhiteSpace(sample.FileName));
        Assert.True(sample.IssueNumber >= 1);
        Assert.NotNull(sample.GroupKey);
    }
}
