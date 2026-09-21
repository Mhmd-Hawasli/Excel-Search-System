using ExcelArchive.Application.DTOs.FileDto;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Application.Services;
using ExcelArchive.Domain.Enums;
using FileColumnEntity = ExcelArchive.Domain.Entities.FileColumn;
using RecordEntity = ExcelArchive.Domain.Entities.Record;

namespace ExcelArchive.Foundation.Tests;

/// <summary>Per-cell keep-old during replace import: the workbook value is
/// swapped for the stored one before shadows/quality are computed.</summary>
public sealed class KeepOldApplierTests
{
    private static FileColumnEntity Col(string raw, string norm, int index, StandardField? field = null)
        => new() { FileId = Guid.NewGuid(), HeaderRaw = raw, HeaderNormalized = norm, ColumnIndex = index, StandardField = field };

    private static RecordEntity Rec(Guid fileId, int row, string json)
        => new() { FileId = fileId, RowIndex = row, Data = System.Text.Json.JsonDocument.Parse(json) };

    private static UploadJobColumn JobCol(string raw, string norm, int index, StandardField? field = null)
        => new(raw, norm, index, field, null);

    [Fact]
    public void Apply_Positional_KeepsChosenCellOnly()
    {
        var fileId = Guid.NewGuid();
        var target = new[] { Col("الاسم", "الاسم", 1), Col("الهاتف", "الهاتف", 2) };
        var @new = new[] { JobCol("الاسم", "الاسم", 1), JobCol("الهاتف", "الهاتف", 2) };
        var old = new[] { Rec(fileId, 2, "{\"الاسم\":\"أحمد\",\"الهاتف\":\"111\"}") };
        var plan = KeepOldApplier.Build(old, target, @new,
            [new KeepOldCell(2, "الهاتف", null)]);
        var data = new Dictionary<string, string> { ["الاسم"] = "أحمد", ["الهاتف"] = "999" };
        KeepOldApplier.Apply(plan, data, 2);
        Assert.Equal("أحمد", data["الاسم"]);
        Assert.Equal("111", data["الهاتف"]);

        var other = new Dictionary<string, string> { ["الاسم"] = "سارة", ["الهاتف"] = "222" };
        KeepOldApplier.Apply(plan, other, 3);
        Assert.Equal("222", other["الهاتف"]);
    }

    [Fact]
    public void Apply_NationalKey_MatchesReorderedRows()
    {
        var fileId = Guid.NewGuid();
        var target = new[]
        {
            Col("الاسم", "الاسم", 1),
            Col("الوطني", "الوطني", 2, StandardField.NationalId),
        };
        var @new = new[]
        {
            JobCol("الوطني", "الوطني", 1, StandardField.NationalId),
            JobCol("الاسم", "الاسم", 2),
        };
        var old = new[]
        {
            Rec(fileId, 2, "{\"الاسم\":\"أحمد\",\"الوطني\":\"12345678901\"}"),
            Rec(fileId, 3, "{\"الاسم\":\"سارة\",\"الوطني\":\"12345678902\"}"),
        };
        var plan = KeepOldApplier.Build(old, target, @new,
            [new KeepOldCell(2, "الاسم", "12345678901")]);
        Assert.NotNull(plan.NationalHeader);
        // New file order is swapped and national column moved: key still hits.
        var data = new Dictionary<string, string> { ["الوطني"] = "12345678901", ["الاسم"] = "أحمد جديد" };
        KeepOldApplier.Apply(plan, data, 9);
        Assert.Equal("أحمد", data["الاسم"]);
        var other = new Dictionary<string, string> { ["الوطني"] = "12345678902", ["الاسم"] = "سارة جديدة" };
        KeepOldApplier.Apply(plan, other, 10);
        Assert.Equal("سارة جديدة", other["الاسم"]);
    }

    [Fact]
    public void Build_UnknownCells_AreIgnored()
    {
        var fileId = Guid.NewGuid();
        var target = new[] { Col("الاسم", "الاسم", 1) };
        var @new = new[] { JobCol("الاسم", "الاسم", 1) };
        var old = new[] { Rec(fileId, 2, "{\"الاسم\":\"أحمد\"}") };
        var plan = KeepOldApplier.Build(old, target, @new,
            [new KeepOldCell(99, "الاسم", null),
             new KeepOldCell(2, "غير موجود", null),
             new KeepOldCell(2, "الاسم", "no-such-key")]);
        var data = new Dictionary<string, string> { ["الاسم"] = "جديد" };
        KeepOldApplier.Apply(plan, data, 2);
        Assert.Equal("جديد", data["الاسم"]);
    }

    [Fact]
    public async Task CreateReplaceJob_KeepOld_ValidationAndPayload()
    {
        using var db = TestHelpers.InMemoryDb();
        var group = new Domain.Entities.Group { Name = "g" };
        db.Groups.Add(group);
        await db.SaveChangesAsync();
        var file = new Domain.Entities.File { GroupId = group.Id, Name = "f", SheetName = "S" };
        db.Files.Add(file);
        await db.SaveChangesAsync();
        db.FileColumns.Add(new FileColumnEntity
        { FileId = file.Id, HeaderRaw = "a", HeaderNormalized = "a", ColumnIndex = 1 });
        await db.SaveChangesAsync();
        var svc = new FileService(TestHelpers.Uow(db), new KeepOldStubActivity(),
            TestHelpers.ColumnOrders(db), new KeepOldStubHeaders());

        // different mode + keep cells → rejected.
        await Assert.ThrowsAsync<InvalidDataException>(() => svc.CreateReplaceJobAsync(file.Id,
            new ReplaceFileRequest("n.xlsx", "S", 1, 0, null, "different",
                [new ReplaceColumnDto("a", "a", 1, null, null)], null, Guid.NewGuid(),
                [new KeepOldCellDto(2, "a", null)]), "test"));

        // Too many entries → rejected (limit 50k for 9k+ bulk cases).
        var huge = Enumerable.Range(2, 50001).Select(r => new KeepOldCellDto(r, "a", null)).ToList();
        await Assert.ThrowsAsync<InvalidDataException>(() => svc.CreateReplaceJobAsync(file.Id,
            new ReplaceFileRequest("n.xlsx", "S", 1, 0, null, "same",
                [new ReplaceColumnDto("a", "a", 1, null, null)], null, Guid.NewGuid(), huge), "test"));

        // Valid keep → persisted into the job payload.
        var jobId = await svc.CreateReplaceJobAsync(file.Id,
            new ReplaceFileRequest("n.xlsx", "S", 1, 0, null, "same",
                [new ReplaceColumnDto("a", "a", 1, null, null)], null, Guid.NewGuid(),
                [new KeepOldCellDto(2, "a", null), new KeepOldCellDto(3, "a", "123")]), "test");
        var job = await db.UploadJobs.FindAsync(jobId);
        Assert.NotNull(job);
        var kept = job!.Payload.RootElement.GetProperty("keepOldCells");
        Assert.Equal(2, kept.GetArrayLength());
        Assert.Equal(2, kept[0].GetProperty("rowIndex").GetInt32());
        Assert.Equal("123", kept[1].GetProperty("matchKey").GetString());
    }

    private sealed class KeepOldStubActivity : Application.Interfaces.Services.IActivityService
    {
        public Task<Application.DTOs.ActivityDto.ActivityResult> ListAsync(
            Application.DTOs.ActivityDto.ActivityFilterRequest request, CancellationToken ct = default)
            => throw new NotImplementedException();
        public Task WriteAsync(ActivityAction action, string targetName, object? details = null, CancellationToken ct = default)
            => Task.CompletedTask;
    }

    private sealed class KeepOldStubHeaders : Application.Interfaces.Excel.IHeaderMappingValidator
    {
        public string? LinkedMappingError(string sheetName, int sheetIndex, IReadOnlyList<string>? supplementalNames, int nationalIdColumnIndex, IReadOnlyList<InspectedColumn> columns) => null;
    }
}
