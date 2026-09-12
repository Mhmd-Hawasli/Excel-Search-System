using System.Text.Json;
using ExcelArchive.Application.Services;
using ExcelArchive.Infrastructure.Implementations.Caching;
using ExcelArchive.Application.DTOs.AuthDto;
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

/// <summary>P4.4: exact rule+record ignore (validation, scope, idempotency)
/// + persistent revision/date-aware cache (locks, caps, rollover).</summary>
public sealed class ConflictP44Tests
{
    private static (AppDbContext Db, ConflictService Svc, Guid FileId, Guid OtherFileId) Setup()
    {
        var db = TestHelpers.InMemoryDb();
        var group = new Group { Name = "cg" + Guid.NewGuid().ToString("N")[..6] };
        db.Groups.Add(group);
        db.SaveChanges();
        FileEntity file(string prefix)
        {
            var f = new FileEntity
            {
                GroupId = group.Id, Name = prefix + Guid.NewGuid().ToString("N")[..6],
                OriginalFilename = "o.xlsx", SheetName = "S",
            };
            db.Files.Add(f);
            db.SaveChanges();
            db.FileColumns.AddRange(
                new FileColumn { FileId = f.Id, HeaderRaw = "h_national", HeaderNormalized = "h_national", ColumnIndex = 1, StandardField = StandardField.NationalId },
                new FileColumn { FileId = f.Id, HeaderRaw = "h_full", HeaderNormalized = "h_full", ColumnIndex = 2, StandardField = StandardField.FullName },
                new FileColumn { FileId = f.Id, HeaderRaw = "h_mother", HeaderNormalized = "h_mother", ColumnIndex = 3, StandardField = StandardField.MotherName });
            db.SaveChanges();
            return f;
        }
        var a = file("cf");
        var b = file("cg");
        return (db, TestHelpers.ConflictSvc(db), a.Id, b.Id);
    }

    private static Guid AddRecord(AppDbContext db, Guid fileId, int row,
        string national, string full, string mother)
    {
        var data = new Dictionary<string, string>
        {
            ["h_national"] = national, ["h_full"] = full, ["h_mother"] = mother,
        };
        var r = new RecordEntity
        {
            FileId = fileId, RowIndex = row,
            Data = JsonDocument.Parse(JsonSerializer.Serialize(data)),
            SfFullName = full, SfNationalId = Domain.Text.ArabicNormalizer.NationalIdAsBigInt(national),
            SfMotherName = mother,
            DNationalId = Domain.Text.ArabicNormalizer.NormalizeNationalId(national),
        };
        db.Records.Add(r);
        db.SaveChanges();
        return r.Id;
    }

    private static DataScopeDto OpenScope() => new() { GroupIds = null, FileIds = null };

    private static DataScopeDto FileScope(Guid fileId)
        => new() { GroupIds = [], FileIds = [fileId] };

    // ---- ignore ----

    [Fact]
    public async Task Ignore_UnknownOrEmptyRule_ThrowsInvalidData()
    {
        var (db, svc, fileId, _) = Setup();
        var id = AddRecord(db, fileId, 2, "123456789", "أحمد", "فاطمة");
        await Assert.ThrowsAsync<InvalidDataException>(
            () => svc.IgnoreAsync("no_such_rule", id, OpenScope()));
        await Assert.ThrowsAsync<InvalidDataException>(
            () => svc.IgnoreAsync("", id, OpenScope()));
        await Assert.ThrowsAsync<InvalidDataException>(
            () => svc.IgnoreAsync("duplicate_national ", id, OpenScope()));
    }

    [Fact]
    public async Task Ignore_MissingRecord_ThrowsKeyNotFound()
    {
        var (_, svc, _, _) = Setup();
        await Assert.ThrowsAsync<KeyNotFoundException>(
            () => svc.IgnoreAsync("duplicate_national", Guid.NewGuid(), OpenScope()));
    }

    [Fact]
    public async Task Ignore_ScopeEnforced_IdempotentOk()
    {
        var (db, svc, fileId, otherId) = Setup();
        var id = AddRecord(db, fileId, 2, "123456789", "أحمد", "فاطمة");
        // Scoped to another file → hidden 404.
        await Assert.ThrowsAsync<KeyNotFoundException>(
            () => svc.IgnoreAsync("duplicate_national", id, FileScope(otherId)));
        // Visible file → ok, twice (idempotent upsert).
        await svc.IgnoreAsync("duplicate_national", id, FileScope(fileId));
        await svc.IgnoreAsync("duplicate_national", id, FileScope(fileId));
        Assert.Equal(1, await db.IgnoredConflicts.CountAsync());
    }

    [Fact]
    public async Task Ignore_HidesOnlyThatRule()
    {
        var (db, svc, fileId, _) = Setup();
        var a = AddRecord(db, fileId, 2, "123456789", "أحمد محمد علي", "فاطمة");
        AddRecord(db, fileId, 3, "123456789", "سارة خالد حسن", "مريم");
        var req = new ValidConflictRequest("conflicting", "national_id", "all", 1, 25, "issueNumber", "asc");
        var before = await svc.ListAsync(req, OpenScope());
        Assert.Equal(2, before.Total);
        Assert.Contains(before.Rows.First(r => r.Id == a).Issues, i => i.Rule == "duplicate_national");

        await svc.IgnoreAsync("duplicate_national", a, OpenScope());
        var after = await svc.ListAsync(req, OpenScope());
        var rowA = after.Rows.First(r => r.Id == a);
        Assert.DoesNotContain(rowA.Issues, i => i.Rule == "duplicate_national");
        Assert.Contains(rowA.Issues, i => i.Rule == "national_people");
        Assert.Equal(2, after.Total);
    }

    // ---- cache ----

    [Fact]
    public async Task Cache_HitServesSamePayload_RevisionBumpInvalidates()
    {
        var (db, svc, fileId, _) = Setup();
        AddRecord(db, fileId, 2, "123", "أحمد", "فاطمة");
        var req = new ValidConflictRequest("invalid", "national_id", "national_short", 1, 25, "issueNumber", "asc");

        var first = await svc.ListAsync(req, OpenScope());
        Assert.Equal(1, first.Total);
        Assert.Equal(1, await db.ConflictQueryCaches.CountAsync());

        // Direct insert does not bump the revision (no triggers on InMemory):
        // the cached payload still holds while the revision is unchanged.
        AddRecord(db, fileId, 3, "456", "سارة", "مريم");
        var second = await svc.ListAsync(req, OpenScope());
        Assert.Equal(1, second.Total);

        // IgnoreAsync bumps the revision → recompute sees both rows.
        var id = await db.Records.Where(r => r.FileId == fileId && r.RowIndex == 3)
            .Select(r => r.Id).FirstAsync();
        await svc.IgnoreAsync("national_short", id, OpenScope());
        var third = await svc.ListAsync(req, OpenScope());
        Assert.Equal(1, third.Total);
        Assert.DoesNotContain(third.Rows, r => r.Id == id);
    }

    [Fact]
    public async Task Cache_SimultaneousMisses_ComputeOnce()
    {
        var db = TestHelpers.InMemoryDb();
        var cache = new ConflictCacheService(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var key = ConflictCacheKeys.BuildKey("t", "{\"a\":1}");
        var calls = 0;
        async Task<string> Compute()
        {
            Interlocked.Increment(ref calls);
            await Task.Delay(50);
            return "v";
        }
        var results = await Task.WhenAll(Enumerable.Range(0, 8)
            .Select(_ => cache.GetOrComputeAsync(key, today, Compute)));
        Assert.All(results, r => Assert.Equal("v", r));
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task Cache_OversizedPayload_ComputedButNotPersisted()
    {
        var db = TestHelpers.InMemoryDb();
        var cache = new ConflictCacheService(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var key = ConflictCacheKeys.BuildKey("big", "{}");
        var big = new string('x', 3 * 1024 * 1024);
        var result = await cache.GetOrComputeAsync(key, today, () => Task.FromResult(big));
        Assert.Equal(big, result);
        Assert.Equal(0, await db.ConflictQueryCaches.CountAsync());
    }

    [Fact]
    public async Task Cache_DateRollover_MissesAndPrunes()
    {
        var db = TestHelpers.InMemoryDb();
        var cache = new ConflictCacheService(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var yesterday = today.AddDays(-1);
        db.ConflictCacheStates.Add(new ConflictCacheState { Id = 1, Revision = 0 });
        db.ConflictQueryCaches.Add(new ConflictQueryCache
        {
            Key = "old", SourceRevision = 0, CheckedDate = yesterday,
            Payload = JsonDocument.Parse("\"v\""), RebuiltAt = DateTime.UtcNow.AddDays(-1),
        });
        await db.SaveChangesAsync();

        Assert.Null(await cache.GetAsync<string>("old", today));
        await cache.PruneAsync(today);
        Assert.Equal(0, await db.ConflictQueryCaches.CountAsync());
    }

    [Fact]
    public async Task Cache_PruneKeeps128Newest()
    {
        var db = TestHelpers.InMemoryDb();
        var cache = new ConflictCacheService(db);
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var baseTime = DateTime.UtcNow;
        for (var i = 0; i < 130; i++)
            db.ConflictQueryCaches.Add(new ConflictQueryCache
            {
                Key = $"k{i:000}", SourceRevision = 0, CheckedDate = today,
                Payload = JsonDocument.Parse("\"v\""), RebuiltAt = baseTime.AddMinutes(-i),
            });
        await db.SaveChangesAsync();
        await cache.PruneAsync(today);
        Assert.Equal(128, await db.ConflictQueryCaches.CountAsync());
        Assert.Null(await db.ConflictQueryCaches.FindAsync("k129"));
        Assert.NotNull(await db.ConflictQueryCaches.FindAsync("k000"));
    }

    [Fact]
    public void Cache_KeyStability()
    {
        var open = new List<Guid>();
        var k1 = ConflictCacheKeys.BuildKey("list",
            ConflictCacheKeys.CanonicalListKey("invalid", "all", "all", 1, 25, "issueNumber", "asc", open));
        var k2 = ConflictCacheKeys.BuildKey("list",
            ConflictCacheKeys.CanonicalListKey("invalid", "all", "all", 1, 25, "issueNumber", "asc", null));
        Assert.NotEqual(k1, k2);
        var k3 = ConflictCacheKeys.BuildKey("list",
            ConflictCacheKeys.CanonicalListKey("invalid", "all", "all", 2, 25, "issueNumber", "asc", open));
        Assert.NotEqual(k1, k3);
        var f1 = new List<Guid> { Guid.Parse("11111111-1111-1111-1111-111111111111"), Guid.Parse("22222222-2222-2222-2222-222222222222") };
        var f2 = new List<Guid> { Guid.Parse("22222222-2222-2222-2222-222222222222"), Guid.Parse("11111111-1111-1111-1111-111111111111") };
        Assert.Equal(
            ConflictCacheKeys.CanonicalListKey("invalid", "all", "all", 1, 25, "issueNumber", "asc", f1),
            ConflictCacheKeys.CanonicalListKey("invalid", "all", "all", 1, 25, "issueNumber", "asc", f2));
    }
}
