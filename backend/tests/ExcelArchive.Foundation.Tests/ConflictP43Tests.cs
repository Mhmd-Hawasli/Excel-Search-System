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

/// <summary>P4.3: conflicting36 (14 existing + 22 directed) with
/// positive/negative + asymmetric fixtures per docs/07.6.</summary>
public sealed class ConflictP43Tests
{
    private static ConflictEngine.EngineRow Row(
        string? national = null, string? sham = null, string? personal = null,
        string? contract = null, string? secondary = null, string? phone = null,
        string? full = null, string? mother = null, string? job = null,
        int? functional = null, string? org = null,
        Guid? fileId = null, bool mapJob = true)
    {
        var mapped = new HashSet<string>(StringComparer.Ordinal)
        {
            "national_id", "sham_cash", "personal_no", "contract_code",
            "full_name", "mother_name", "phone", "functional_category",
            "organizational_level",
        };
        if (mapJob) mapped.Add("job_title");
        var headers = mapped.ToDictionary(k => k, k => $"h_{k}", StringComparer.Ordinal);
        var display = full ?? "";
        return new ConflictEngine.EngineRowWithHeaders(
            Guid.NewGuid(), fileId ?? Guid.NewGuid(), Guid.NewGuid(), "f", "o.xlsx", 2,
            display, mother ?? "", national ?? "", sham ?? "", personal ?? "",
            full ?? "", "", "", "", job ?? "", phone ?? "",
            functional?.ToString() ?? "", functional,
            mapped, [], headers,
            ContractRaw: contract ?? "", SecondaryRaw: secondary ?? "", OrgLevelRaw: org ?? "");
    }

    private static bool Has(IReadOnlyDictionary<Guid, IReadOnlyList<ConflictEngine.EngineIssue>> m,
        ConflictEngine.EngineRow row, string rule)
        => m.TryGetValue(row.Id, out var list) && list.Any(i => i.Rule == rule);

    private static IReadOnlyDictionary<Guid, IReadOnlyList<ConflictEngine.EngineIssue>> Eval(
        params ConflictEngine.EngineRow[] rows)
        => ConflictEngine.EvaluateConflicting(rows, null);

    private static IReadOnlyDictionary<Guid, IReadOnlyList<ConflictEngine.EngineIssue>> EvalSel(
        ISet<string> selected, params ConflictEngine.EngineRow[] rows)
        => ConflictEngine.EvaluateConflicting(rows, selected);

    // ---- duplicate_* ----

    [Fact]
    public void DuplicateNational_IntraFileOnly()
    {
        var file = Guid.NewGuid();
        var a = Row(national: "123456789", full: "أحمد محمد علي", mother: "فاطمة", fileId: file);
        var b = Row(national: "123456789", full: "سارة خالد حسن", mother: "مريم", fileId: file);
        var m = Eval(a, b);
        Assert.True(Has(m, a, "duplicate_national"));
        Assert.True(Has(m, b, "duplicate_national"));

        // Same key across different files is NOT a duplicate.
        var c = Row(national: "123456789", full: "أحمد محمد علي", mother: "فاطمة");
        var d = Row(national: "123456789", full: "سارة خالد حسن", mother: "مريم");
        Assert.False(Has(Eval(c, d), c, "duplicate_national"));
    }

    [Fact]
    public void DuplicateShamPersonalContract()
    {
        var file = Guid.NewGuid();
        var sham = "1".PadLeft(16, '0');
        var a = Row(sham: sham, fileId: file);
        var b = Row(sham: sham, fileId: file);
        Assert.True(Has(Eval(a, b), a, "duplicate_sham"));

        var c = Row(personal: "777", fileId: file);
        var d = Row(personal: "777", fileId: file);
        Assert.True(Has(Eval(c, d), c, "duplicate_personal"));

        var e = Row(contract: "C-1", fileId: file);
        var f = Row(contract: "C-1", fileId: file);
        Assert.True(Has(Eval(e, f), e, "duplicate_contract"));

        // Single rows never duplicate.
        Assert.Empty(Eval(Row(national: "123456789")));
    }

    // ---- *_people ----

    [Fact]
    public void NationalPeople_RequiresDistinctPersons()
    {
        var a = Row(national: "123456789", full: "أحمد محمد علي", mother: "فاطمة");
        var b = Row(national: "123456789", full: "سارة خالد حسن", mother: "مريم");
        var m = Eval(a, b);
        Assert.True(Has(m, a, "national_people"));
        Assert.True(Has(m, b, "national_people"));

        // Same person twice is not "people".
        var c = Row(national: "123456789", full: "أحمد محمد علي", mother: "فاطمة");
        var d = Row(national: "123456789", full: "أحمد محمد علي", mother: "فاطمة");
        Assert.False(Has(Eval(c, d), c, "national_people"));

        var e = Row(sham: "1111222233334444", full: "أحمد محمد علي", mother: "فاطمة");
        var f = Row(sham: "1111222233334444", full: "سارة خالد حسن", mother: "مريم");
        Assert.True(Has(Eval(e, f), e, "sham_people"));

        var g = Row(personal: "42", full: "أحمد محمد علي", mother: "فاطمة");
        var h = Row(personal: "42", full: "سارة خالد حسن", mother: "مريم");
        Assert.True(Has(Eval(g, h), g, "personal_people"));
    }

    // ---- person_* ----

    [Fact]
    public void PersonNationalShamPersonalContract()
    {
        var a = Row(national: "111111111", full: "أحمد محمد علي", mother: "فاطمة");
        var b = Row(national: "222222222", full: "أحمد محمد علي", mother: "فاطمة");
        Assert.True(Has(Eval(a, b), a, "person_national"));

        var c = Row(sham: "1111222233334444", full: "أحمد محمد علي", mother: "فاطمة");
        var d = Row(sham: "5555666677778888", full: "أحمد محمد علي", mother: "فاطمة");
        Assert.True(Has(Eval(c, d), c, "person_sham"));

        var e = Row(personal: "1", full: "أحمد محمد علي", mother: "فاطمة");
        var f = Row(personal: "2", full: "أحمد محمد علي", mother: "فاطمة");
        Assert.True(Has(Eval(e, f), e, "person_personal"));

        // Primary contract only: secondary difference alone does not flag.
        var g = Row(contract: "C1", secondary: "S1", full: "أحمد محمد علي", mother: "فاطمة");
        var h = Row(contract: "C2", secondary: "S1", full: "أحمد محمد علي", mother: "فاطمة");
        Assert.True(Has(Eval(g, h), g, "person_contract"));
        var i = Row(contract: "C1", secondary: "S1", full: "أحمد محمد علي", mother: "فاطمة");
        var j = Row(contract: "C1", secondary: "S2", full: "أحمد محمد علي", mother: "فاطمة");
        Assert.False(Has(Eval(i, j), i, "person_contract"));
    }

    [Fact]
    public void PersonJob_RequiresMapping()
    {
        var a = Row(full: "أحمد محمد علي", mother: "فاطمة", job: "مهندس");
        var b = Row(full: "أحمد محمد علي", mother: "فاطمة", job: "طبيب");
        Assert.True(Has(Eval(a, b), a, "person_job"));

        var c = Row(full: "أحمد محمد علي", mother: "فاطمة", job: "مهندس", mapJob: false);
        var d = Row(full: "أحمد محمد علي", mother: "فاطمة", job: "طبيب", mapJob: false);
        Assert.False(Has(Eval(c, d), c, "person_job"));
    }

    [Fact]
    public void PersonCategory_OrgLevel()
    {
        var a = Row(full: "أحمد محمد علي", mother: "فاطمة", functional: 1);
        var b = Row(full: "أحمد محمد علي", mother: "فاطمة", functional: 2);
        var m = Eval(a, b);
        Assert.True(Has(m, a, "person_category"));
        var issue = m[a.Id].First(i => i.Rule == "person_category");
        Assert.Contains("فئة الأولى", issue.Explanation);
        Assert.Contains("فئة الثانية", issue.Explanation);

        var c = Row(full: "أحمد محمد علي", mother: "فاطمة", org: "أولى");
        var d = Row(full: "أحمد محمد علي", mother: "فاطمة", org: "ثانية");
        Assert.True(Has(Eval(c, d), c, "person_org_level"));
    }

    // ---- directed pairs + asymmetry ----

    [Fact]
    public void PairNationalPersonal_Asymmetric()
    {
        // N1 → {M1, M2}: A and B flagged for national→personal.
        var a = Row(national: "111111111", personal: "1", full: "أحمد", mother: "فاطمة");
        var b = Row(national: "111111111", personal: "2", full: "سارة", mother: "مريم");
        var m = Eval(a, b);
        Assert.True(Has(m, a, "pair_national_personal"));
        Assert.True(Has(m, b, "pair_national_personal"));
        // Reverse: M1 → {N1} single, M2 → {N1} single: no personal→national.
        Assert.False(Has(m, a, "pair_personal_national"));
        Assert.False(Has(m, b, "pair_personal_national"));

        // M1 → {N1, N2}: personal→national flags without national→personal.
        var c = Row(national: "111111111", personal: "9", full: "أحمد", mother: "فاطمة");
        var d = Row(national: "222222222", personal: "9", full: "سارة", mother: "مريم");
        var m2 = Eval(c, d);
        Assert.True(Has(m2, c, "pair_personal_national"));
        Assert.False(Has(m2, c, "pair_national_personal"));
    }

    [Fact]
    public void PairNullToStillBelongsToGroup()
    {
        // N1 → {M1} plus a row with N1 and null personal: group of one
        // distinct value is not flagged at all.
        var a = Row(national: "111111111", personal: "1");
        var b = Row(national: "111111111", personal: "");
        Assert.False(Has(Eval(a, b), a, "pair_national_personal"));

        // N1 → {M1, M2} plus a null-personal row: null row still flagged.
        var c = Row(national: "111111111", personal: "1");
        var d = Row(national: "111111111", personal: "2");
        var e = Row(national: "111111111", personal: "");
        var m = Eval(c, d, e);
        Assert.True(Has(m, e, "pair_national_personal"));
    }

    [Fact]
    public void PairPersonSides_AndContractPhone()
    {
        var a = Row(full: "أحمد محمد علي", mother: "فاطمة",
            contract: "C1", secondary: "S1", phone: "0911");
        var b = Row(full: "أحمد محمد علي", mother: "فاطمة",
            contract: "C2", secondary: "S1", phone: "0922");
        var m = Eval(a, b);
        Assert.True(Has(m, a, "pair_person_contract"));
        Assert.True(Has(m, a, "pair_person_phone"));
        Assert.True(Has(m, a, "person_contract"));

        var c = Row(national: "111111111", sham: "1111222233334444");
        var d = Row(national: "111111111", sham: "5555666677778888");
        Assert.True(Has(Eval(c, d), c, "pair_national_sham"));
        Assert.True(Has(Eval(c, d), c, "pair_sham_national") == false);
    }

    [Fact]
    public void SelectedSet_FiltersRules()
    {
        var file = Guid.NewGuid();
        var a = Row(national: "123456789", full: "أحمد", mother: "فاطمة", fileId: file);
        var b = Row(national: "123456789", full: "سارة", mother: "مريم", fileId: file);
        var onlyDup = EvalSel(new HashSet<string> { "duplicate_national" }, a, b);
        Assert.True(Has(onlyDup, a, "duplicate_national"));
        Assert.False(Has(onlyDup, a, "national_people"));
        var none = EvalSel(new HashSet<string> { "pair_phone_sham" }, a, b);
        Assert.Empty(none);
    }

    [Fact]
    public void GroupKeyExpressions_MatchV1()
    {
        var row = ConflictEngine.ViewOf(Row(
            national: "123456789", sham: "1111222233334444", personal: "7",
            contract: "C1", secondary: "S1", phone: "0999",
            full: "أحمد محمد علي", mother: "فاطمة"));
        Assert.EndsWith("|123456789", ConflictEngine.ConflictingGroupKey("duplicate_national", row));
        Assert.Equal("123456789", ConflictEngine.ConflictingGroupKey("national_people", row));
        Assert.Contains("|", ConflictEngine.ConflictingGroupKey("person_national", row));
        Assert.Equal("123456789", ConflictEngine.ConflictingGroupKey("pair_national_sham", row));
        Assert.Equal("7", ConflictEngine.ConflictingGroupKey("pair_personal_sham", row));
        Assert.Contains("|", ConflictEngine.ConflictingGroupKey("pair_person_contract", row));
    }

    // ---- service wiring: dense-rank groups + broad per-row ----

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
        db.FileColumns.AddRange(
            new FileColumn { FileId = file.Id, HeaderRaw = "h_national", HeaderNormalized = "h_national", ColumnIndex = 1, StandardField = StandardField.NationalId },
            new FileColumn { FileId = file.Id, HeaderRaw = "h_full", HeaderNormalized = "h_full", ColumnIndex = 2, StandardField = StandardField.FullName },
            new FileColumn { FileId = file.Id, HeaderRaw = "h_mother", HeaderNormalized = "h_mother", ColumnIndex = 3, StandardField = StandardField.MotherName });
        db.SaveChanges();
        return (db, TestHelpers.ConflictSvc(db), file.Id);
    }

    private static void AddRecord(AppDbContext db, Guid fileId, int row,
        string national, string full, string mother)
    {
        var data = new Dictionary<string, string>
        {
            ["h_national"] = national, ["h_full"] = full, ["h_mother"] = mother,
        };
        db.Records.Add(new RecordEntity
        {
            FileId = fileId, RowIndex = row,
            Data = JsonDocument.Parse(JsonSerializer.Serialize(data)),
            SfFullName = full, SfNationalId = Domain.Text.ArabicNormalizer.NationalIdAsBigInt(national),
            SfMotherName = mother,
            DNationalId = Domain.Text.ArabicNormalizer.NormalizeNationalId(national),
        });
        db.SaveChanges();
    }

    private static ValidConflictRequest Req(string category, string field = "all", string rule = "all")
        => new(category, field, rule, 1, 25, "issueNumber", "asc");

    private static DataScopeDto OpenScope() => new() { GroupIds = null, FileIds = null };

    [Fact]
    public async Task Service_DuplicateNational_SharesGroupKeyDenseRank()
    {
        var (db, svc, fileId) = SetupService();
        AddRecord(db, fileId, 2, "123456789", "أحمد محمد علي", "فاطمة");
        AddRecord(db, fileId, 3, "123456789", "سارة خالد حسن", "مريم");
        AddRecord(db, fileId, 4, "987654321", "عمر زيد قاسم", "نور");

        var r = await svc.ListAsync(Req("conflicting", "national_id", "duplicate_national"), OpenScope());
        Assert.Equal(2, r.Total);
        Assert.Equal(r.Rows[0].GroupKey, r.Rows[1].GroupKey);
        Assert.Equal(r.Rows[0].IssueNumber, r.Rows[1].IssueNumber);
        Assert.Equal("duplicate_national", Assert.Single(r.Rows[0].Issues).Rule);
    }

    [Fact]
    public async Task Service_ConflictingBroad_PerRowGroupKeys()
    {
        var (db, svc, fileId) = SetupService();
        AddRecord(db, fileId, 2, "123456789", "أحمد محمد علي", "فاطمة");
        AddRecord(db, fileId, 3, "123456789", "سارة خالد حسن", "مريم");

        var r = await svc.ListAsync(Req("conflicting"), OpenScope());
        Assert.True(r.Total >= 2);
        // Broad query isolates rows (V1 per-row fallback): distinct keys.
        Assert.NotEqual(r.Rows[0].GroupKey, r.Rows[1].GroupKey);
        Assert.All(r.Rows, row => Assert.Contains("duplicate_national", row.Issues.Select(i => i.Rule)));
    }
}
