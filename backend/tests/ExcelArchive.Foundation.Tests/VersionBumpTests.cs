using System.Text.Json;
using ClosedXML.Excel;
using ExcelArchive.Application.DTOs.ActivityDto;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Infrastructure.Implementations.Excel;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using ExcelArchive.Infrastructure.Implementations.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using FileEntity = ExcelArchive.Domain.Entities.File;

namespace ExcelArchive.Foundation.Tests;

/// <summary>Version-bump contract: manual N → N+1 with a note, clean update
/// N → N+1, update over pending manual edits N → N+2 with the manual edits
/// in their own separate version (N+1).</summary>
public sealed class VersionBumpTests : IDisposable
{
    private readonly string _storeDir;
    private readonly List<XLWorkbook> _books = [];

    public VersionBumpTests()
    {
        _storeDir = Path.Combine(Path.GetTempPath(), "vertests", Guid.NewGuid().ToString("N"));
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
            .AddSingleton<IColumnOrderService>(
                new ExcelArchive.Application.Services.ColumnOrderService(TestHelpers.Uow(db)))
            .BuildServiceProvider();
        return (db, sp, activity, store);
    }

    private static ExcelArchive.Application.Services.FileService Files(AppDbContext db, StubActivity activity)
        => new(TestHelpers.Uow(db), activity,
            new ExcelArchive.Application.Services.ColumnOrderService(TestHelpers.Uow(db)),
            new HeaderMappingValidatorAdapter());

    private static async Task<(Group Group, FileEntity File)> SeedFileAsync(AppDbContext db, int version = 1)
    {
        var group = new Group { Name = "g-" + Guid.NewGuid().ToString("N") };
        db.Groups.Add(group);
        await db.SaveChangesAsync();
        var file = new FileEntity
        {
            GroupId = group.Id, Name = "f-" + Guid.NewGuid().ToString("N"),
            OriginalFilename = "o.xlsx", SheetName = "S", RowCount = 1,
            ColumnSignature = "sig", Version = version,
        };
        db.Files.Add(file);
        await db.SaveChangesAsync();
        return (group, file);
    }

    [Fact]
    public void PermissionCatalog_ContainsVersionsBump()
    {
        Assert.Contains(Permissions.VersionsBump, Permissions.Canonical);
        Assert.Contains(Permissions.VersionsBump, Permissions.OwnerGlobals);
        Assert.Equal("versions.bump", Permissions.VersionsBump);
    }

    [Fact]
    public async Task BumpVersion_ArchivesLiveEdits_BumpsToNPlus1_WithNote()
    {
        var (db, _, activity, _) = Fresh();
        using (db)
        {
            var (_, file) = await SeedFileAsync(db);
            var recordId = Guid.NewGuid();
            db.RecordEdits.Add(new RecordEdit
            {
                RecordId = recordId, FileId = file.Id,
                HeaderRaw = "الاسم", OldValue = "أ", NewValue = "ب", EditedBy = "test",
            });
            await db.SaveChangesAsync();

            var result = await Files(db, activity).BumpVersionAsync(
                file.Id, "تصحيح أسماء بعد المراجعة", "test");

            Assert.Equal(1, result.PreviousVersion);
            Assert.Equal(2, result.NewVersion);
            Assert.Equal(1, result.ArchivedEdits);
            Assert.Equal(2, (await db.Files.FirstAsync(f => f.Id == file.Id)).Version);
            var archived = await db.RecordEdits.SingleAsync();
            Assert.Null(archived.RecordId);
            Assert.Null(archived.FileColumnId);
            Assert.Equal(1, archived.FileVersion);
            var versionRow = await db.FileVersions.SingleAsync(v => v.FileId == file.Id);
            Assert.Equal(2, versionRow.Version);
            Assert.Equal("تصحيح أسماء بعد المراجعة", versionRow.Note);
            Assert.Equal("manual", versionRow.Kind);
            Assert.Equal("test", versionRow.CreatedBy);
            Assert.Contains(activity.Writes, w => w.Action == ActivityAction.FileVersionBumped);
        }
    }

    [Fact]
    public async Task BumpVersion_CleanFile_BumpsWithoutArchive()
    {
        var (db, _, activity, _) = Fresh();
        using (db)
        {
            var (_, file) = await SeedFileAsync(db);
            var result = await Files(db, activity).BumpVersionAsync(file.Id, "تثبيت نسخة معتمدة", "test");
            Assert.Equal(2, result.NewVersion);
            Assert.Equal(0, result.ArchivedEdits);
            Assert.Empty(await db.RecordEdits.ToListAsync());
        }
    }

    [Fact]
    public async Task BumpVersion_RejectsMissingNote()
    {
        var (db, _, activity, _) = Fresh();
        using (db)
        {
            var (_, file) = await SeedFileAsync(db);
            await Assert.ThrowsAsync<InvalidDataException>(
                () => Files(db, activity).BumpVersionAsync(file.Id, " ", "test"));
            await Assert.ThrowsAsync<InvalidDataException>(
                () => Files(db, activity).BumpVersionAsync(file.Id, null, "test"));
            Assert.Equal(1, (await db.Files.FirstAsync(f => f.Id == file.Id)).Version);
        }
    }

    [Fact]
    public async Task BumpVersion_MissingFile_ThrowsNotFound()
    {
        var (db, _, activity, _) = Fresh();
        using (db)
        {
            await Assert.ThrowsAsync<KeyNotFoundException>(
                () => Files(db, activity).BumpVersionAsync(Guid.NewGuid(), "ملاحظة", "test"));
        }
    }

    [Fact]
    public async Task GetVersions_BackfillsSeedRows_AndCountsEdits()
    {
        var (db, _, activity, _) = Fresh();
        using (db)
        {
            // V3 file predating the history table: no file_versions rows at all.
            var (_, file) = await SeedFileAsync(db, version: 3);
            db.RecordEdits.Add(new RecordEdit
            {
                RecordId = null, FileId = file.Id, FileVersion = 2,
                HeaderRaw = "هـ", OldValue = "x", NewValue = "y", EditedBy = "a",
            });
            db.RecordEdits.Add(new RecordEdit
            {
                RecordId = Guid.NewGuid(), FileId = file.Id, FileVersion = 3,
                HeaderRaw = "هـ", OldValue = "y", NewValue = "z", EditedBy = "b",
            });
            await db.SaveChangesAsync();

            var response = await Files(db, activity).GetVersionsAsync(file.Id);

            Assert.NotNull(response);
            Assert.Equal(3, response.CurrentVersion);
            Assert.Equal(1, response.PendingEditCount);
            Assert.Equal([3, 2, 1], response.Versions.Select(v => v.Version));
            Assert.Equal(1, response.Versions.Single(v => v.Version == 2).EditCount);
            Assert.Equal(1, response.Versions.Single(v => v.Version == 3).EditCount);
            Assert.Equal("seed", response.Versions.Single(v => v.Version == 1).Kind);
        }
    }

    [Fact]
    public async Task VersionExport_RewindsThroughEditLog()
    {
        var (db, _, activity, _) = Fresh();
        using (db)
        {
            var (_, file) = await SeedFileAsync(db, version: 2);
            db.FileColumns.Add(new FileColumn
            {
                FileId = file.Id, HeaderRaw = "الاسم", HeaderNormalized = "الاسم", ColumnIndex = 1,
            });
            await db.SaveChangesAsync();
            var record = new ExcelArchive.Domain.Entities.Record
            {
                FileId = file.Id, RowIndex = 2,
                Data = JsonDocument.Parse("{\"الاسم\":\"ج\"}"),
                DNationalId = "00123456789",
            };
            db.Records.Add(record);
            await db.SaveChangesAsync();
            // V1 manual edit أ → ب (archived: bump nulled the record link;
            // the stable national id still resolves the current row),
            // then a live V2 edit ب → ج.
            db.RecordEdits.Add(new RecordEdit
            {
                RecordId = null, FileId = file.Id, FileVersion = 1,
                HeaderRaw = "الاسم", OldValue = "أ", NewValue = "ب",
                EditedBy = "test", NationalId = "00123456789",
            });
            db.RecordEdits.Add(new RecordEdit
            {
                RecordId = record.Id, FileId = file.Id, FileVersion = 2,
                HeaderRaw = "الاسم", OldValue = "ب", NewValue = "ج",
                EditedBy = "test", NationalId = "00123456789",
            });
            await db.SaveChangesAsync();

            var svc = Files(db, activity);
            // End-of-V1 includes the manual edit made during V1 (أ → ب);
            // the live V2 edit (ب → ج) is rewound away.
            var v1 = await svc.GetVersionExportDataAsync(file.Id, 1);
            Assert.NotNull(v1);
            Assert.Equal("ب", Assert.Single(v1.Records).Data["الاسم"]);
            Assert.Single(v1.Edits);
            var v2 = await svc.GetVersionExportDataAsync(file.Id, 2);
            Assert.NotNull(v2);
            Assert.Equal("ج", Assert.Single(v2.Records).Data["الاسم"]);
            Assert.Equal(2, v2.Edits.Count);
            await Assert.ThrowsAsync<InvalidDataException>(
                () => svc.GetVersionExportDataAsync(file.Id, 3));
            await Assert.ThrowsAsync<InvalidDataException>(
                () => svc.GetVersionExportDataAsync(file.Id, 0));
        }
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
    public async Task ReplaceSame_CleanFile_BumpsNPlus1_WithVersionRows()
    {
        var (db, sp, _, store) = Fresh();
        using (db)
        {
            var group = new Group { Name = "g" };
            db.Groups.Add(group);
            await db.SaveChangesAsync();
            var cols = new[] { ("الاسم", (string?)"full_name") };
            var old = Book(("الاسم", ["قديم"]));
            _books.Add(old);
            var first = await AddJob(db, Payload(await store.SaveAsync("o.xlsx", Save(old)), group.Id, "target", cols));
            await TestHelpers.UploadProcessor(db, sp).RunAsync(first, CancellationToken.None);
            var target = await db.Files.FirstAsync(f => f.Name == "target");

            var nw = Book(("الاسم", ["جديد"]));
            _books.Add(nw);
            var job = await AddJob(db, Payload(await store.SaveAsync("n.xlsx", Save(nw)),
                group.Id, "مؤقت-x", cols, mode: "replace", fileId: target.Id, replaceMode: "same"));
            await TestHelpers.UploadProcessor(db, sp).RunAsync(job, CancellationToken.None);

            var kept = await db.Files.FirstAsync();
            Assert.Equal(2, kept.Version);
            var versions = await db.FileVersions.Where(v => v.FileId == kept.Id).OrderBy(v => v.Version).ToListAsync();
            Assert.Equal([1, 2], versions.Select(v => v.Version));
            Assert.Equal("upload", versions[0].Kind);
            Assert.Equal("update", versions[1].Kind);
            var bulk = Assert.Single(await db.RecordEdits.ToListAsync(), e => e.RecordId != null);
            Assert.Equal(2, bulk.FileVersion);
            Assert.True(bulk.IsBulk);
        }
    }

    [Fact]
    public async Task ReplaceSame_WithPendingEdits_BumpsNPlus2_ManualGetsOwnVersion()
    {
        var (db, sp, _, store) = Fresh();
        using (db)
        {
            var group = new Group { Name = "g" };
            db.Groups.Add(group);
            await db.SaveChangesAsync();
            var cols = new[] { ("الاسم", (string?)"full_name") };
            var old = Book(("الاسم", ["قديم"]));
            _books.Add(old);
            var first = await AddJob(db, Payload(await store.SaveAsync("o.xlsx", Save(old)), group.Id, "target", cols));
            await TestHelpers.UploadProcessor(db, sp).RunAsync(first, CancellationToken.None);
            var target = await db.Files.FirstAsync(f => f.Name == "target");
            var oldRecordId = (await db.Records.FirstAsync()).Id;
            db.RecordEdits.Add(new RecordEdit
            {
                RecordId = oldRecordId, FileId = target.Id,
                HeaderRaw = "الاسم", OldValue = "قديم", NewValue = "قديم معدل", EditedBy = "test",
            });
            await db.SaveChangesAsync();

            var nw = Book(("الاسم", ["جديد"]));
            _books.Add(nw);
            var job = await AddJob(db, Payload(await store.SaveAsync("n.xlsx", Save(nw)),
                group.Id, "مؤقت-x", cols, mode: "replace", fileId: target.Id, replaceMode: "same"));
            await TestHelpers.UploadProcessor(db, sp).RunAsync(job, CancellationToken.None);

            var kept = await db.Files.FirstAsync();
            Assert.Equal(3, kept.Version);
            var versions = await db.FileVersions.Where(v => v.FileId == kept.Id).OrderBy(v => v.Version).ToListAsync();
            Assert.Equal([1, 2, 3], versions.Select(v => v.Version));
            Assert.Equal("manual", versions[1].Kind);
            Assert.Equal("update", versions[2].Kind);
            var allEdits = await db.RecordEdits.ToListAsync();
            var manual = Assert.Single(allEdits, e => e.RecordId == null);
            Assert.Equal(2, manual.FileVersion);
            Assert.Equal("قديم معدل", manual.NewValue);
            Assert.False(manual.IsBulk);
            var bulk = Assert.Single(allEdits, e => e.RecordId != null);
            Assert.Equal(3, bulk.FileVersion);
            Assert.Equal("قديم", bulk.OldValue);
            Assert.Equal("جديد", bulk.NewValue);
            Assert.True(bulk.IsBulk);
        }
    }
}
