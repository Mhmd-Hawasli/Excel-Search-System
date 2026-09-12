using System.Text.Json;
using ExcelArchive.Infrastructure.Implementations.Excel;
using ExcelArchive.Application.Services;
using ExcelArchive.Application.DTOs.AuthDto;
using ClosedXML.Excel;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Common.Conflicts;
using ExcelArchive.Application.DTOs.ConflictDto;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;
using FileEntity = ExcelArchive.Domain.Entities.File;
using RecordEntity = ExcelArchive.Domain.Entities.Record;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P4.5: full 12-column export (V1 layout, labels, formatting) +
/// statistics endpoint.</summary>
public sealed class ConflictP45Tests
{
    private static (AppDbContext Db, ConflictService Svc, Guid FileId) Setup()
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
            new FileColumn { FileId = file.Id, HeaderRaw = "h_mother", HeaderNormalized = "h_mother", ColumnIndex = 3, StandardField = StandardField.MotherName },
            new FileColumn { FileId = file.Id, HeaderRaw = "h_sham", HeaderNormalized = "h_sham", ColumnIndex = 4, StandardField = StandardField.ShamCash });
        db.SaveChanges();
        return (db, TestHelpers.ConflictSvc(db), file.Id);
    }

    private static void AddRecord(AppDbContext db, Guid fileId, int row,
        string national, string full, string mother, string sham = "")
    {
        var data = new Dictionary<string, string>
        {
            ["h_national"] = national, ["h_full"] = full,
            ["h_mother"] = mother, ["h_sham"] = sham,
        };
        db.Records.Add(new RecordEntity
        {
            FileId = fileId, RowIndex = row,
            Data = JsonDocument.Parse(JsonSerializer.Serialize(data)),
            SfFullName = full, SfNationalId = Domain.Text.ArabicNormalizer.NationalIdAsBigInt(national),
            SfMotherName = mother, SfShamCash = string.IsNullOrEmpty(sham) ? null : 1111222233334444L,
            DNationalId = Domain.Text.ArabicNormalizer.NormalizeNationalId(national),
        });
        db.SaveChanges();
    }

    private static DataScopeDto OpenScope() => new() { GroupIds = null, FileIds = null };

    [Fact]
    public async Task Export_TwelveColumns_RuleLabels_AndFormatting()
    {
        var (db, svc, fileId) = Setup();
        AddRecord(db, fileId, 2, "123", "أحمد محمد علي", "فاطمة", "12AB");
        AddRecord(db, fileId, 3, "123456789", "سارة خالد حسن", "مريم");

        var bytes = await svc.ExportAsync(
            new ValidConflictRequest("invalid", "all", "all", 1, 25, "issueNumber", "asc"), OpenScope());
        using var wb = new XLWorkbook(new MemoryStream(bytes));
        var ws = wb.Worksheets.First();
        Assert.Equal("تضارب البيانات", ws.Name);
        Assert.True(ws.RightToLeft);
        var headers = Enumerable.Range(1, 12).Select(c => ws.Cell(1, c).GetString()).ToList();
        Assert.Equal("رقم المشكلة", headers[0]);
        Assert.Equal("الملف", headers[1]);
        Assert.Equal("صف Excel", headers[2]);
        Assert.Equal("الاسم الثلاثي", headers[3]);
        Assert.Equal("اسم الأم", headers[4]);
        Assert.Equal("الرقم الوطني", headers[5]);
        Assert.Equal("الشام كاش", headers[6]);
        Assert.Equal("الرقم الذاتي", headers[7]);
        Assert.Equal("الهاتف", headers[8]);
        Assert.Equal("الفئة الوظيفية", headers[9]);
        Assert.Equal("القاعدة", headers[10]);
        Assert.Equal("الشرح", headers[11]);
        // Rule column carries Arabic labels, not keys.
        var ruleCell = ws.Cell(2, 11).GetString();
        Assert.DoesNotContain("national_short", ruleCell);
        Assert.Contains("وطني", ruleCell);
        // National padded to 11 display digits.
        Assert.Equal("00000000123", ws.Cell(2, 6).GetString());
        // Sham grouped 4-4-4-4 (record 1 carries "12AB" → digits "12").
        Assert.Equal("0000 0000 0000 0012", ws.Cell(2, 7).GetString());
    }

    [Fact]
    public async Task Export_SameSemanticsAsList_FullMatchBeyondPage()
    {
        var (db, svc, fileId) = Setup();
        for (var i = 0; i < 5; i++)
            AddRecord(db, fileId, 2 + i, $"12{i}", $"اسم{i} أب{i} جد{i}", "أم");
        var list = await svc.ListAsync(
            new ValidConflictRequest("invalid", "national_id", "national_short", 1, 2, "issueNumber", "asc"), OpenScope());
        Assert.Equal(5, list.Total);
        Assert.Equal(2, list.Rows.Count);
        var bytes = await svc.ExportAsync(
            new ValidConflictRequest("invalid", "national_id", "national_short", 1, 2, "issueNumber", "asc"), OpenScope());
        using var wb = new XLWorkbook(new MemoryStream(bytes));
        // Export ignores paging: all 5 matching rows present.
        Assert.Equal(6, wb.Worksheets.First().LastRowUsed()!.RowNumber());
    }

    [Fact]
    public async Task Stats_CountsRulesAndFiles()
    {
        var (db, svc, fileId) = Setup();
        AddRecord(db, fileId, 2, "123", "أحمد محمد علي", "فاطمة");
        AddRecord(db, fileId, 3, "123", "سارة خالد حسن", "مريم");

        var stats = await svc.StatsAsync(OpenScope());
        Assert.Equal(2, stats.RecordsScanned);
        Assert.Equal(1, stats.FilesScanned);
        Assert.True(stats.Instances >= 4);
        Assert.Contains(stats.Rules, r => r.Rule == "national_short");
        Assert.Contains(stats.Rules, r => r.Rule == "duplicate_national");
        Assert.Contains(stats.Rules, r => r.Rule == "national_people");
        var file = Assert.Single(stats.Files);
        Assert.Equal(fileId, file.FileId);

        var empty = await svc.StatsAsync(new DataScopeDto { GroupIds = [], FileIds = [] });
        Assert.Equal(0, empty.Instances);
    }

    [Fact]
    public void ExportFormatHelpers()
    {
        Assert.Equal("1111 2222 3333 4444", ConflictExportBuilder.FormatSham("1111222233334444"));
        Assert.Equal("raw", ConflictExportBuilder.FormatSham("raw"));
        Assert.Equal("فئة الأولى", ConflictExportBuilder.FormatFunctional(1));
        Assert.Equal("", ConflictExportBuilder.FormatFunctional(null));
        Assert.Equal("فئة غير معروفة", ConflictExportBuilder.FormatFunctional(0));
    }
}
