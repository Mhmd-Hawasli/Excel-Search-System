using System.Text.Json;
using ClosedXML.Excel;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.ActivityDto;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Infrastructure.Implementations.Excel;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using ExcelArchive.Infrastructure.Implementations.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using FileEntity = ExcelArchive.Domain.Entities.File;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P2.3 import pipeline tests over InMemory + a real temp file store.
/// Mirrors V1 import-worker test intent (rows, shadows, quality, cleanup).</summary>
public sealed class WorkerTests : IDisposable
{
    private readonly string _storeDir;
    private readonly List<XLWorkbook> _books = [];

    public WorkerTests()
    {
        _storeDir = Path.Combine(Path.GetTempPath(), "p2tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_storeDir);
    }

    public void Dispose()
    {
        foreach (var wb in _books) wb.Dispose();
        try { Directory.Delete(_storeDir, recursive: true); } catch { /* best effort */ }
    }

    private sealed class StubActivity : IActivityService
    {
        public readonly List<(ActivityAction Action, string Target)> Writes = [];
        public Task<ActivityResult> ListAsync(ActivityFilterRequest request, CancellationToken ct = default)
            => throw new NotImplementedException();
        public Task WriteAsync(ActivityAction action, string targetName, object? details = null, CancellationToken ct = default)
        {
            Writes.Add((action, targetName));
            return Task.CompletedTask;
        }
    }

    private (AppDbContext Db, IServiceProvider Sp, StubActivity Activity, WorkbookFileStore Store) Fresh()
    {
        var db = TestHelpers.InMemoryDb();
        var activity = new StubActivity();
        var config = TestHelpers.Config();
        config["UploadStore:Path"] = _storeDir;
        var store = new WorkbookFileStore(config);
        var sp = new ServiceCollection()
            .AddSingleton(store)
            .AddSingleton<IActivityService>(activity)
            .AddSingleton<ExcelArchive.Application.Interfaces.Services.IColumnOrderService>(
                new ExcelArchive.Application.Services.ColumnOrderService(TestHelpers.Uow(db)))
            .BuildServiceProvider();
        return (db, sp, activity, store);
    }

    private static XLWorkbook Book(params (string Header, string?[] Values)[] columns)
    {
        var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("S");
        for (var c = 0; c < columns.Length; c++)
        {
            ws.Cell(1, c + 1).Value = columns[c].Header;
            for (var r = 0; r < columns[c].Values.Length; r++)
                if (columns[c].Values[r] is string v)
                    ws.Cell(r + 2, c + 1).Value = v;
        }
        return wb;
    }

    private static byte[] Save(XLWorkbook wb)
    {
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static string Payload(
        string token, Guid groupId, string name,
        IReadOnlyList<(string Header, string? Field)> columns,
        string mode = "single", Guid? fileId = null, string? replaceMode = null) =>
        JsonSerializer.Serialize(new
        {
            token, groupId, name, description = "",
            originalFilename = "t.xlsx", sheetName = "S", sheetIndex = 1, totalRows = 10,
            columnSignature = "sig",
            columns = columns.Select((c, i) => new
            {
                headerRaw = c.Header, headerNormalized = c.Header.ToLowerInvariant(),
                columnIndex = i + 1, standardField = c.Field, categoryId = (Guid?)null,
            }),
            mode, fileId, replaceMode,
        });

    private static async Task<UploadJob> AddJob(AppDbContext db, string payloadJson)
    {
        var job = new UploadJob
        {
            Status = UploadJobStatus.Pending, TotalRows = 10,
            Payload = JsonDocument.Parse(payloadJson), StartedAt = DateTime.UtcNow,
        };
        db.UploadJobs.Add(job);
        await db.SaveChangesAsync();
        return job;
    }

    [Fact]
    public async Task SingleImport_RowsShadowsQualityDone()
    {
        var (db, sp, activity, store) = Fresh();
        using (db)
        {
            var group = new Group { Name = "g" };
            db.Groups.Add(group);
            await db.SaveChangesAsync();
            var wb = Book(
                ("الاسم الثلاثي", ["أحمد علي", null, "xx"]),
                ("الرقم الوطني", ["123456789", null, "abc"]),
                ("رقم الهاتف", ["0912345678", null, "1"]),
                ("الشام كاش", ["1234567890123456", null, "5"]),
                ("الفئة", ["الأولى", null, "سادسة"]));
            _books.Add(wb);
            var token = await store.SaveAsync("t.xlsx", Save(wb));
            var cols = new[] { ("الاسم الثلاثي", (string?)"full_name"), ("الرقم الوطني", (string?)"national_id"), ("رقم الهاتف", (string?)"phone"), ("الشام كاش", (string?)"sham_cash"), ("الفئة", (string?)"functional_category") };
            var job = await AddJob(db, Payload(token, group.Id, "f1", cols));

            await TestHelpers.UploadProcessor(db, sp).RunAsync(job, CancellationToken.None);

            var file = await db.Files.Include(f => f.Columns).FirstAsync();
            Assert.Equal(2, file.RowCount);
            Assert.Equal(5, file.Columns.Count);
            var records = await db.Records.OrderBy(r => r.RowIndex).ToListAsync();
            Assert.Equal([2, 4], records.Select(r => r.RowIndex));
            var good = records[0];
            Assert.Equal(123456789L, good.NationalIdNum);
            Assert.Equal("00123456789", good.DNationalId);
            Assert.Equal(1234567890123456L, good.SfShamCash);
            Assert.Equal(1, good.SfFunctionalCategory);
            var issues = await db.DataQualityIssues.ToListAsync();
            Assert.Contains(issues, i => i.IssueType == DataQualityIssueType.InvalidNationalId && i.RowIndex == 4);
            Assert.Contains(issues, i => i.IssueType == DataQualityIssueType.InvalidPhone && i.RowIndex == 4);
            Assert.Contains(issues, i => i.IssueType == DataQualityIssueType.InvalidShamCash && i.RowIndex == 4);
            Assert.Contains(issues, i => i.IssueType == DataQualityIssueType.InvalidFunctionalCategory && i.RowIndex == 4);
            Assert.Contains(issues, i => i.IssueType == DataQualityIssueType.EmptyRow && i.RowIndex == 3);
            var reloaded = await db.UploadJobs.FirstAsync(j => j.Id == job.Id);
            Assert.Equal(UploadJobStatus.Done, reloaded.Status);
            Assert.Equal(3, reloaded.TotalRows);
            Assert.Contains(activity.Writes, w => w.Action == ActivityAction.FileUploaded);
            Assert.False(System.IO.File.Exists(store.PathFor(token)));
        }
    }

    [Fact]
    public async Task ExpiredToken_Throws_CreatesNothing()
    {
        var (db, sp, _, _) = Fresh();
        using (db)
        {
            var group = new Group { Name = "g" };
            db.Groups.Add(group);
            await db.SaveChangesAsync();
            var cols = new[] { ("h", (string?)"full_name") };
            var job = await AddJob(db, Payload(Guid.NewGuid().ToString(), group.Id, "f1", cols));
            await Assert.ThrowsAsync<KeyNotFoundException>(
                () => TestHelpers.UploadProcessor(db, sp).RunAsync(job, CancellationToken.None));
            Assert.Empty(await db.Files.ToListAsync());
        }
    }

    [Fact]
    public async Task DuplicateName_Throws_CreatesNothing()
    {
        var (db, sp, _, _) = Fresh();
        using (db)
        {
            var group = new Group { Name = "g" };
            db.Groups.Add(group);
            db.Files.Add(new FileEntity { GroupId = group.Id, Name = "dup", SheetName = "S" });
            await db.SaveChangesAsync();
            var wb = Book(("h", ["v"]));
            _books.Add(wb);
            var store = sp.GetRequiredService<WorkbookFileStore>();
            var token = await store.SaveAsync("t.xlsx", Save(wb));
            var cols = new[] { ("h", (string?)"full_name") };
            var job = await AddJob(db, Payload(token, group.Id, "dup", cols));
            var ex = await Assert.ThrowsAsync<InvalidOperationException>(
                () => TestHelpers.UploadProcessor(db, sp).RunAsync(job, CancellationToken.None));
            Assert.Equal("اسم الملف مستخدم بالفعل. اختر اسمًا آخر.", ex.Message);
            Assert.Single(await db.Files.ToListAsync());
        }
    }

    [Fact]
    public async Task LinkedImport_JoinsSupplementalValues()
    {
        var (db, sp, _, _) = Fresh();
        using (db)
        {
            var group = new Group { Name = "g" };
            db.Groups.Add(group);
            await db.SaveChangesAsync();
            var wb = new XLWorkbook();
            _books.Add(wb);
            var main = wb.Worksheets.Add("Main");
            main.Cell("A1").Value = "الرقم الوطني";
            main.Cell("B1").Value = "الاسم";
            main.Cell("A2").Value = "123456789";
            main.Cell("B2").Value = "أحمد";
            var sup = wb.Worksheets.Add("Sup");
            sup.Cell("A1").Value = "الرقم الوطني";
            sup.Cell("B1").Value = "المدينة";
            sup.Cell("A2").Value = "123456789";
            sup.Cell("B2").Value = "دمشق";
            var store = sp.GetRequiredService<WorkbookFileStore>();
            var token = await store.SaveAsync("t.xlsx", Save(wb));
            var payload = JsonSerializer.Serialize(new
            {
                token, groupId = group.Id, name = "linked", description = "",
                originalFilename = "t.xlsx", sheetName = "Main", sheetIndex = 1, totalRows = 1,
                columnSignature = "sig",
                columns = new object[]
                {
                    new { headerRaw = "الرقم الوطني", headerNormalized = "الرقم الوطني", columnIndex = 1, standardField = "national_id", categoryId = (Guid?)null },
                    new { headerRaw = "الاسم", headerNormalized = "الاسم", columnIndex = 2, standardField = "full_name", categoryId = (Guid?)null },
                    new { headerRaw = "المدينة", headerNormalized = "المدينه", columnIndex = 3, standardField = (string?)null, categoryId = (Guid?)null },
                },
                mode = "single",
                linkedSheets = new { sheetNames = new[] { "Sup" }, nationalIdColumnIndex = 1 },
            });
            var job = await AddJob(db, payload);
            await TestHelpers.UploadProcessor(db, sp).RunAsync(job, CancellationToken.None);
            var record = await db.Records.FirstAsync();
            Assert.Equal("دمشق", record.Data.RootElement.GetProperty("المدينة").GetString());
            Assert.Equal(123456789L, record.NationalIdNum);
        }
    }

    [Fact]
    public async Task ReplaceSame_PromotesAtomically()
    {
        var (db, sp, activity, store) = Fresh();
        using (db)
        {
            var group = new Group { Name = "g" };
            db.Groups.Add(group);
            await db.SaveChangesAsync();
            var old = Book(("الاسم", ["قديم"]));
            _books.Add(old);
            var cols = new[] { ("الاسم", (string?)"full_name") };
            var first = await AddJob(db, Payload(await store.SaveAsync("o.xlsx", Save(old)), group.Id, "target", cols));
            await TestHelpers.UploadProcessor(db, sp).RunAsync(first, CancellationToken.None);
            var target = await db.Files.FirstAsync(f => f.Name == "target");
            var oldRecordId = (await db.Records.FirstAsync()).Id;

            var nw = Book(("الاسم", ["جديد"]));
            _books.Add(nw);
            var token = await store.SaveAsync("n.xlsx", Save(nw));
            var job = await AddJob(db, Payload(token, group.Id, "مؤقت-x", cols,
                mode: "replace", fileId: target.Id, replaceMode: "same"));
            await TestHelpers.UploadProcessor(db, sp).RunAsync(job, CancellationToken.None);

            Assert.Equal(1, await db.Files.CountAsync());
            var kept = await db.Files.FirstAsync();
            Assert.Equal(target.Id, kept.Id);
            Assert.Equal(1, kept.Version);
            Assert.Equal("جديد", (await db.Records.FirstAsync()).Data.RootElement.GetProperty("الاسم").GetString());
            Assert.DoesNotContain(oldRecordId, await db.Records.Select(r => r.Id).ToListAsync());
            var reloaded = await db.UploadJobs.FirstAsync(j => j.Id == job.Id);
            Assert.Equal(UploadJobStatus.Done, reloaded.Status);
            Assert.Equal(target.Id, reloaded.FileId);
            Assert.Contains(activity.Writes, w => w.Action == ActivityAction.FileUpdated);
            Assert.DoesNotContain(activity.Writes, w => w.Action == ActivityAction.FileUploaded && w.Target == "مؤقت-x");
        }
    }

    [Fact]
    public async Task ReplaceDifferent_BumpsVersion()
    {
        var (db, sp, activity, store) = Fresh();
        using (db)
        {
            var group = new Group { Name = "g" };
            db.Groups.Add(group);
            await db.SaveChangesAsync();
            var old = Book(("الاسم", ["قديم"]));
            _books.Add(old);
            var cols = new[] { ("الاسم", (string?)"full_name") };
            var first = await AddJob(db, Payload(await store.SaveAsync("o.xlsx", Save(old)), group.Id, "target", cols));
            await TestHelpers.UploadProcessor(db, sp).RunAsync(first, CancellationToken.None);
            var targetId = (await db.Files.FirstAsync()).Id;

            var nw = Book(("اللقب", ["جديد"]));
            _books.Add(nw);
            var token = await store.SaveAsync("n.xlsx", Save(nw));
            var newCols = new[] { ("اللقب", (string?)null) };
            var job = await AddJob(db, Payload(token, group.Id, "مؤقت-y", newCols,
                mode: "replace", fileId: targetId, replaceMode: "different"));
            await TestHelpers.UploadProcessor(db, sp).RunAsync(job, CancellationToken.None);

            var kept = Assert.Single(await db.Files.ToListAsync());
            Assert.Equal("target", kept.Name);
            Assert.Equal(2, kept.Version);
            Assert.Contains(activity.Writes, w => w.Action == ActivityAction.FileReplaced);
        }
    }
}
