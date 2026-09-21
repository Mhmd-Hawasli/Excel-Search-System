using ExcelArchive.Application.Common;
using ExcelArchive.Application.DTOs.ActivityDto;
using ExcelArchive.Application.DTOs.FileDto;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Interfaces.Storage;
using ExcelArchive.Application.Services;
using ExcelArchive.Domain.Entities;
using FileEntity = ExcelArchive.Domain.Entities.File;
using RecordEntity = ExcelArchive.Domain.Entities.Record;

namespace ExcelArchive.Foundation.Tests;

/// <summary>Replace-preview contract: column gate, cell-by-cell diff,
/// manual-edit distinction, added/removed rows.</summary>
public sealed class ReplacePreviewTests
{
    private sealed class StubReader(WorkbookImportData data) : IWorkbookReader
    {
        public Task<WorkbookImportData> ReadForImportAsync(
            byte[] bytes, string token, WorkbookImportSpec spec, CancellationToken ct = default)
            => Task.FromResult(data);
        public string BuildColumnSignature(IEnumerable<string> headers)
            => string.Join("|", headers);
    }

    private sealed class StubStore : IWorkbookFileStore
    {
        public string PathFor(string token) => token;
        public Task<string> SaveAsync(string fileName, byte[] bytes, CancellationToken ct = default)
            => Task.FromResult(Guid.NewGuid().ToString());
        public Task<byte[]> LoadAsync(string token, CancellationToken ct = default)
            => Task.FromResult(Array.Empty<byte>());
        public void Remove(string token) { }
        public void PruneStale(TimeSpan? maxAge = null) { }
    }

    private static async Task<(FileEntity File, RecordEntity R1, RecordEntity R2)> SeedFileAsync(
        ExcelArchive.Infrastructure.Implementations.Persistence.AppDbContext db,
        bool withNationalId = false)
    {
        var group = new Group { Name = "g" };
        db.Groups.Add(group);
        await db.SaveChangesAsync();
        var file = new FileEntity { GroupId = group.Id, Name = "f", SheetName = "S", RowCount = 2, Version = 1 };
        db.Files.Add(file);
        await db.SaveChangesAsync();
        db.FileColumns.Add(new FileColumn
        {
            FileId = file.Id, HeaderRaw = "الاسم", HeaderNormalized = "الاسم",
            ColumnIndex = 1, StandardField = Domain.Enums.StandardField.FullName,
        });
        db.FileColumns.Add(new FileColumn
        {
            FileId = file.Id, HeaderRaw = "الهاتف", HeaderNormalized = "الهاتف",
            ColumnIndex = 2, StandardField = Domain.Enums.StandardField.Phone,
        });
        if (withNationalId)
            db.FileColumns.Add(new FileColumn
            {
                FileId = file.Id, HeaderRaw = "الوطني", HeaderNormalized = "الوطني",
                ColumnIndex = 3, StandardField = Domain.Enums.StandardField.NationalId,
            });
        await db.SaveChangesAsync();
        var r1 = new RecordEntity
        {
            FileId = file.Id, RowIndex = 2,
            Data = System.Text.Json.JsonDocument.Parse(
                withNationalId ? "{\"الاسم\":\"أحمد\",\"الهاتف\":\"111\",\"الوطني\":\"12345678901\"}"
                               : "{\"الاسم\":\"أحمد\",\"الهاتف\":\"111\"}"),
        };
        var r2 = new RecordEntity
        {
            FileId = file.Id, RowIndex = 3,
            Data = System.Text.Json.JsonDocument.Parse(
                withNationalId ? "{\"الاسم\":\"سارة\",\"الهاتف\":\"222\",\"الوطني\":\"12345678902\"}"
                               : "{\"الاسم\":\"سارة\",\"الهاتف\":\"222\"}"),
        };
        db.Records.AddRange(r1, r2);
        await db.SaveChangesAsync();
        return (file, r1, r2);
    }

    private static ReplaceFileRequest Req(Guid token, bool national = false) => new(
        "n.xlsx", "S", 1, 2, null, "same",
        national
            ? [new ReplaceColumnDto("الاسم", "الاسم", 1, "full_name", null),
               new ReplaceColumnDto("الهاتف", "الهاتف", 2, "phone", null),
               new ReplaceColumnDto("الوطني", "الوطني", 3, "national_id", null)]
            : [new ReplaceColumnDto("الاسم", "الاسم", 1, "full_name", null),
               new ReplaceColumnDto("الهاتف", "الهاتف", 2, "phone", null)],
        null, token);

    [Fact]
    public async Task Preview_NonIdentical_ReturnsColumnDiffOnly()
    {
        using var db = TestHelpers.InMemoryDb();
        var (file, _, _) = await SeedFileAsync(db);
        var token = Guid.NewGuid();
        var svc = new ReplacePreviewService(TestHelpers.Uow(db),
            new StubReader(new WorkbookImportData("S", [])), new StubStore());
        var req = Req(token) with
        {
            Columns = [new ReplaceColumnDto("جديد", "جديد", 1, null, null)],
        };
        var res = await svc.PreviewAsync(file.Id, req);
        Assert.False(res.Identical);
        Assert.Contains("جديد", res.AddedColumns);
        Assert.Null(res.Summary);
    }

    [Fact]
    public async Task Preview_FlagsManualEdit_AndCountsCells()
    {
        using var db = TestHelpers.InMemoryDb();
        var (file, r1, _) = await SeedFileAsync(db);
        db.RecordEdits.Add(new RecordEdit
        {
            RecordId = r1.Id, FileId = file.Id, HeaderRaw = "الهاتف",
            OldValue = "000", NewValue = "111", EditedBy = "test", FileVersion = 1,
        });
        await db.SaveChangesAsync();
        var token = Guid.NewGuid();
        var import = new WorkbookImportData("S", [
            new ImportRowDto(2, ["أحمد", "999"], null),
            new ImportRowDto(3, ["سارة", "222"], null),
        ]);
        var svc = new ReplacePreviewService(TestHelpers.Uow(db), new StubReader(import), new StubStore());
        var res = await svc.PreviewAsync(file.Id, Req(token));
        Assert.True(res.Identical);
        Assert.NotNull(res.Summary);
        Assert.Equal(2, res.Summary.MatchedRows);
        Assert.Equal(4, res.Summary.TotalCellsCompared);
        Assert.Equal(1, res.Summary.ChangedCells);
        Assert.Equal(1, res.Summary.ChangedRows);
        Assert.Equal(1, res.Summary.UnchangedRows);
        Assert.Equal(1, res.Summary.ManualOverwriteCount);
        var change = Assert.Single(res.Changes!);
        Assert.Equal(2, change.RowIndex);
        Assert.Equal("الهاتف", change.HeaderRaw);
        Assert.Equal("111", change.CurrentValue);
        Assert.Equal("999", change.NewValue);
        Assert.True(change.WasManuallyEdited);
        Assert.Equal("test", change.EditedBy);
        var phone = res.ColumnStats!.First(c => c.HeaderRaw == "الهاتف");
        Assert.Equal(1, phone.ChangedCells);
        Assert.Equal(1, phone.ManualOverwriteCells);
    }

    [Fact]
    public async Task Preview_ManualFirst_WhenManyChanges()
    {
        using var db = TestHelpers.InMemoryDb();
        var group = new Group { Name = "g" };
        db.Groups.Add(group);
        await db.SaveChangesAsync();
        var file = new FileEntity { GroupId = group.Id, Name = "f", SheetName = "S", RowCount = 600, Version = 1 };
        db.Files.Add(file);
        await db.SaveChangesAsync();
        db.FileColumns.Add(new FileColumn
        {
            FileId = file.Id, HeaderRaw = "الاسم", HeaderNormalized = "الاسم",
            ColumnIndex = 1, StandardField = Domain.Enums.StandardField.FullName,
        });
        await db.SaveChangesAsync();
        const int N = 600;
        var records = new List<RecordEntity>(N);
        for (var i = 0; i < N; i++)
            records.Add(new RecordEntity
            {
                FileId = file.Id, RowIndex = i + 2,
                Data = System.Text.Json.JsonDocument.Parse($"{{\"الاسم\":\"قديم {i}\"}}"),
            });
        db.Records.AddRange(records);
        await db.SaveChangesAsync();
        // Manual edit on the LAST row only: it must surface first.
        var last = records[^1];
        db.RecordEdits.Add(new RecordEdit
        {
            RecordId = last.Id, FileId = file.Id, HeaderRaw = "الاسم",
            OldValue = "x", NewValue = $"قديم {N - 1}", EditedBy = "test", FileVersion = 1,
        });
        await db.SaveChangesAsync();
        var rows = Enumerable.Range(0, N)
            .Select(i => new ImportRowDto(i + 2, [$"جديد {i}"], null))
            .ToList();
        var svc = new ReplacePreviewService(TestHelpers.Uow(db),
            new StubReader(new WorkbookImportData("S", rows)), new StubStore());
        var req = new ReplaceFileRequest("n.xlsx", "S", 1, N, null, "same",
            [new ReplaceColumnDto("الاسم", "الاسم", 1, "full_name", null)],
            null, Guid.NewGuid());
        var res = await svc.PreviewAsync(file.Id, req);
        Assert.True(res.Identical);
        Assert.Equal(N, res.Summary!.ChangedCells);
        Assert.Equal(N, res.Changes!.Count);
        Assert.False(res.Truncated);
        Assert.Equal(1, res.Summary.ManualOverwriteCount);
        // Manual-first ordering: first change is the edited last row.
        Assert.True(res.Changes[0].WasManuallyEdited);
        Assert.Equal(N + 1, res.Changes[0].RowIndex);
    }

    [Fact]
    public async Task Preview_IdenticalData_ZeroChanges()
    {
        using var db = TestHelpers.InMemoryDb();
        var (file, _, _) = await SeedFileAsync(db);
        var import = new WorkbookImportData("S", [
            new ImportRowDto(2, ["أحمد", "111"], null),
            new ImportRowDto(3, ["سارة", "222"], null),
        ]);
        var svc = new ReplacePreviewService(TestHelpers.Uow(db), new StubReader(import), new StubStore());
        var res = await svc.PreviewAsync(file.Id, Req(Guid.NewGuid()));
        Assert.True(res.Identical);
        Assert.Equal(0, res.Summary!.ChangedCells);
        Assert.Equal(2, res.Summary.UnchangedRows);
        Assert.Empty(res.Changes!);
    }

    [Fact]
    public async Task Preview_NationalId_ReordersWithoutFalseChanges()
    {
        using var db = TestHelpers.InMemoryDb();
        var (file, _, _) = await SeedFileAsync(db, withNationalId: true);
        // Same data, swapped order: key matching must yield zero changes.
        var import = new WorkbookImportData("S", [
            new ImportRowDto(2, ["سارة", "222", "12345678902"], null),
            new ImportRowDto(3, ["أحمد", "111", "12345678901"], null),
        ]);
        var svc = new ReplacePreviewService(TestHelpers.Uow(db), new StubReader(import), new StubStore());
        var res = await svc.PreviewAsync(file.Id, Req(Guid.NewGuid(), national: true));
        Assert.True(res.Identical);
        Assert.Equal("nationalId", res.MatchMode);
        Assert.Equal(0, res.Summary!.ChangedCells);
        Assert.Equal(2, res.Summary.MatchedRows);
    }

    [Fact]
    public async Task Preview_AddedRemoved_RowsCounted()
    {
        using var db = TestHelpers.InMemoryDb();
        var (file, _, _) = await SeedFileAsync(db);
        var import = new WorkbookImportData("S", [
            new ImportRowDto(2, ["أحمد", "111"], null),
            new ImportRowDto(3, ["سارة", "222"], null),
            new ImportRowDto(4, ["جديد", "333"], null),
        ]);
        var svc = new ReplacePreviewService(TestHelpers.Uow(db), new StubReader(import), new StubStore());
        var res = await svc.PreviewAsync(file.Id, Req(Guid.NewGuid()));
        Assert.Equal(1, res.Summary!.AddedRows);
        Assert.Equal(0, res.Summary.RemovedRows);
        Assert.Contains(4, res.AddedRowSample!);
    }

    [Fact]
    public async Task Preview_AddedColumnAtStart_ComparesByName()
    {
        using var db = TestHelpers.InMemoryDb();
        var (file, _, _) = await SeedFileAsync(db);
        // New column inserted FIRST: values shift positionally, but matching
        // is by name so common columns show zero changes.
        var import = new WorkbookImportData("S", [
            new ImportRowDto(2, ["ق1", "أحمد", "111"], null),
            new ImportRowDto(3, ["", "سارة", "222"], null),
        ]);
        var svc = new ReplacePreviewService(TestHelpers.Uow(db), new StubReader(import), new StubStore());
        var req = new ReplaceFileRequest("n.xlsx", "S", 1, 2, null, "same",
            [new ReplaceColumnDto("جديد", "جديد", 1, null, null),
             new ReplaceColumnDto("الاسم", "الاسم", 2, "full_name", null),
             new ReplaceColumnDto("الهاتف", "الهاتف", 3, "phone", null)],
            null, Guid.NewGuid());
        var res = await svc.PreviewAsync(file.Id, req);
        Assert.True(res.Identical);
        Assert.Equal(["جديد"], res.AddedColumns);
        Assert.Empty(res.RemovedColumns);
        Assert.Equal(0, res.Summary!.ChangedCells);
        Assert.Equal(4, res.Summary.TotalCellsCompared);
        Assert.Equal(2, res.ColumnStats!.Count);
        var added = Assert.Single(res.NewColumns!);
        Assert.Equal("جديد", added.HeaderRaw);
        Assert.Equal(1, added.FilledValues);
    }

    [Fact]
    public async Task Preview_ReorderedColumns_NoFalseChanges()
    {
        using var db = TestHelpers.InMemoryDb();
        var (file, _, _) = await SeedFileAsync(db);
        var import = new WorkbookImportData("S", [
            new ImportRowDto(2, ["111", "أحمد"], null),
            new ImportRowDto(3, ["222", "سارة"], null),
        ]);
        var svc = new ReplacePreviewService(TestHelpers.Uow(db), new StubReader(import), new StubStore());
        var req = new ReplaceFileRequest("n.xlsx", "S", 1, 2, null, "same",
            [new ReplaceColumnDto("الهاتف", "الهاتف", 1, "phone", null),
             new ReplaceColumnDto("الاسم", "الاسم", 2, "full_name", null)],
            null, Guid.NewGuid());
        var res = await svc.PreviewAsync(file.Id, req);
        Assert.True(res.Identical);
        Assert.Equal(0, res.Summary!.ChangedCells);
    }

    [Fact]
    public async Task Preview_RemovedColumn_NotIdentical()
    {
        using var db = TestHelpers.InMemoryDb();
        var (file, _, _) = await SeedFileAsync(db);
        var import = new WorkbookImportData("S", [
            new ImportRowDto(2, ["أحمد"], null),
        ]);
        var svc = new ReplacePreviewService(TestHelpers.Uow(db), new StubReader(import), new StubStore());
        var req = new ReplaceFileRequest("n.xlsx", "S", 1, 1, null, "same",
            [new ReplaceColumnDto("الاسم", "الاسم", 1, "full_name", null)],
            null, Guid.NewGuid());
        var res = await svc.PreviewAsync(file.Id, req);
        Assert.False(res.Identical);
        Assert.Contains("الهاتف", res.RemovedColumns);
        Assert.Null(res.Summary);
    }

    private sealed class StubActivity : IActivityService
    {
        public Task<ActivityResult> ListAsync(ActivityFilterRequest request, CancellationToken ct = default)
            => throw new NotImplementedException();
        public Task WriteAsync(Domain.Enums.ActivityAction action, string targetName, object? details = null, CancellationToken ct = default)
            => Task.CompletedTask;
    }

    private sealed class HeaderValidatorStub : IHeaderMappingValidator
    {
        public string? LinkedMappingError(string sheetName, int sheetIndex, IReadOnlyList<string>? supplementalNames, int nationalIdColumnIndex, IReadOnlyList<InspectedColumn> columns) => null;
    }

    [Fact]
    public async Task ReplaceJob_AllowsAddedColumn_SameMode()
    {
        using var db = TestHelpers.InMemoryDb();
        var (file, _, _) = await SeedFileAsync(db);
        var files = new FileService(TestHelpers.Uow(db), new StubActivity(),
            TestHelpers.ColumnOrders(db), new HeaderValidatorStub());
        var jobId = await files.CreateReplaceJobAsync(file.Id,
            new ReplaceFileRequest("n.xlsx", "S", 1, 2, null, "same",
                [new ReplaceColumnDto("جديد", "جديد", 1, null, null),
                 new ReplaceColumnDto("الاسم", "الاسم", 2, "full_name", null),
                 new ReplaceColumnDto("الهاتف", "الهاتف", 3, "phone", null)],
                null, Guid.NewGuid()), "test");
        Assert.NotEqual(Guid.Empty, jobId);
    }

    [Fact]
    public async Task ReplaceJob_RemovedColumn_SameMode_ThrowsConflict()
    {
        using var db = TestHelpers.InMemoryDb();
        var (file, _, _) = await SeedFileAsync(db);
        var files = new FileService(TestHelpers.Uow(db), new StubActivity(),
            TestHelpers.ColumnOrders(db), new HeaderValidatorStub());
        await Assert.ThrowsAsync<ConflictException>(() => files.CreateReplaceJobAsync(file.Id,
            new ReplaceFileRequest("n.xlsx", "S", 1, 1, null, "same",
                [new ReplaceColumnDto("الاسم", "الاسم", 1, "full_name", null)],
                null, Guid.NewGuid()), "test"));
    }
}
