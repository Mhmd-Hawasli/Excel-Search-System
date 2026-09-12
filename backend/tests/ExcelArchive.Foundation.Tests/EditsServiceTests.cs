using System.Text.Json;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Services;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using FileEntity = ExcelArchive.Domain.Entities.File;
using RecordEntity = ExcelArchive.Domain.Entities.Record;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P3.3 E01–E05 vectors (InMemory): A→B→C→revert, no-op, overlong,
/// mismatched column, server-derived revert, badge/history shape.</summary>
public sealed class EditsServiceTests
{
    private static (AppDbContext Db, EditsService Svc, Guid RecordId, Guid ColumnId) Setup()
    {
        var db = TestHelpers.InMemoryDb();
        var group = new Group { Name = "eg" + Guid.NewGuid().ToString("N")[..6] };
        db.Groups.Add(group);
        db.SaveChanges();
        var file = new FileEntity { GroupId = group.Id, Name = "ef" + Guid.NewGuid().ToString("N")[..6], SheetName = "S" };
        db.Files.Add(file);
        db.SaveChanges();
        var col = new FileColumn
        {
            FileId = file.Id, HeaderRaw = "الاسم", HeaderNormalized = "الاسم",
            ColumnIndex = 1, StandardField = StandardField.FullName,
        };
        db.FileColumns.Add(col);
        db.SaveChanges();
        var record = new RecordEntity
        {
            FileId = file.Id,
            RowIndex = 2,
            Data = JsonDocument.Parse("{\"الاسم\":\"A\"}"),
            SfFullName = "A",
        };
        db.Records.Add(record);
        db.SaveChanges();
        var activity = new ActivityService(TestHelpers.Uow(db));
        return (db, new EditsService(TestHelpers.Uow(db), activity), record.Id, col.Id);
    }

    private static DataScopeDto OpenScope() => new() { GroupIds = null, FileIds = null };

    [Fact]
    public async Task Save_Revert_Noop_Flow()
    {
        var (db, svc, recordId, colId) = Setup();
        var scope = OpenScope();

        var a = await svc.SaveAsync(recordId, colId, null, "B", "tester", scope);
        Assert.True(a.Changed);
        Assert.Equal("A", a.OldValue);
        Assert.Equal("B", a.NewValue);

        var b = await svc.SaveAsync(recordId, colId, null, "C", "tester", scope);
        Assert.True(b.Changed);
        Assert.Equal("B", b.OldValue);

        var history = await svc.GetRecordEditsAsync(recordId);
        Assert.Equal(2, history.Edits.Count);
        Assert.Equal("C", history.Edits[0].NewValue);
        Assert.Equal(2, history.EditedHeaders["الاسم"].Count);
        Assert.Equal("A", history.EditedHeaders["الاسم"].OriginalValue);
        Assert.Equal("C", history.EditedHeaders["الاسم"].LastValue);

        var noop = await svc.SaveAsync(recordId, colId, null, "C", "tester", scope);
        Assert.False(noop.Changed);
        Assert.Equal(2, (await svc.GetRecordEditsAsync(recordId)).Edits.Count);

        var revert = await svc.RevertAsync(recordId, colId, null, "tester", scope);
        Assert.True(revert.Changed);
        Assert.Equal("B", revert.NewValue);
        var after = await svc.GetRecordEditsAsync(recordId);
        Assert.Equal(3, after.Edits.Count);
        Assert.Equal("A", after.EditedHeaders["الاسم"].OriginalValue);
        Assert.Equal("B", after.EditedHeaders["الاسم"].LastValue);
    }

    [Fact]
    public async Task Save_Overlong_Rejects()
    {
        var (_, svc, recordId, colId) = Setup();
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            svc.SaveAsync(recordId, colId, null, new string('x', 5001), "tester", OpenScope()));
    }

    [Fact]
    public async Task Save_UnknownColumn_Rejects()
    {
        var (_, svc, recordId, _) = Setup();
        await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            svc.SaveAsync(recordId, Guid.NewGuid(), null, "x", "tester", OpenScope()));
    }

    [Fact]
    public async Task Revert_WithoutHistory_Rejects()
    {
        var (_, svc, recordId, colId) = Setup();
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            svc.RevertAsync(recordId, colId, null, "tester", OpenScope()));
    }

    [Fact]
    public async Task Visit_WritesActivity()
    {
        var (db, svc, recordId, _) = Setup();
        var user = TestHelpers.User();
        await svc.VisitAsync(recordId, user, OpenScope());
        Assert.Equal(1, db.ActivityLogs.Count());
    }

    [Fact]
    public async Task List_IncludesPersonNameAndRowIndex()
    {
        var (db, svc, recordId, colId) = Setup();
        await svc.SaveAsync(recordId, colId, null, "B", "tester", OpenScope());
        var page = await svc.ListAsync(null, OpenScope(), 1, 25);
        var item = Assert.Single(page.Items);
        Assert.Equal("B", item.PersonName);
        Assert.Equal(2, item.RowIndex);
        Assert.Equal(1, page.Total);
    }
}
