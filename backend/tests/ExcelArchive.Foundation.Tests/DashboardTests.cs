using ExcelArchive.Api.Controllers;
using ExcelArchive.Application.Services;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Entities;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FileEntity = ExcelArchive.Domain.Entities.File;
using RecordEntity = ExcelArchive.Domain.Entities.Record;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P2.1 scoped dashboard reads (docs/05: GET dashboard + V1 page.tsx).</summary>
public sealed class DashboardTests
{
    private static ExcelArchive.Infrastructure.Implementations.Persistence.AppDbContext Seeded()
    {
        var db = TestHelpers.InMemoryDb();
        var g1 = new Group { Name = "g1" };
        var g2 = new Group { Name = "g2" };
        db.Groups.AddRange(g1, g2);
        db.SaveChanges();
        var f1 = new FileEntity { GroupId = g1.Id, Name = "f1", RowCount = 4, UploadedAt = DateTime.UtcNow.AddHours(-3) };
        var f2 = new FileEntity { GroupId = g1.Id, Name = "f2", RowCount = 6, UploadedAt = DateTime.UtcNow.AddHours(-2) };
        var f3 = new FileEntity { GroupId = g2.Id, Name = "f3", RowCount = 10, UploadedAt = DateTime.UtcNow.AddHours(-1) };
        db.Files.AddRange(f1, f2, f3);
        db.FileColumns.Add(new FileColumn { FileId = f1.Id, HeaderRaw = "h", HeaderNormalized = "h", ColumnIndex = 0 });
        var empty = System.Text.Json.JsonDocument.Parse("{}");
        foreach (var (file, rows) in new[] { (f1, 4), (f2, 6), (f3, 10) })
            for (var i = 0; i < rows; i++)
                db.Records.Add(new RecordEntity { FileId = file.Id, RowIndex = i, Data = empty });
        db.RecordEdits.Add(new RecordEdit
        {
            RecordId = Guid.NewGuid(), FileId = f3.Id, HeaderRaw = "h", OldValue = "a", NewValue = "b",
        });
        db.SaveChanges();
        return db;
    }

    [Fact]
    public async Task GlobalUser_GetsAllCounts_RecentFive_Badges()
    {
        using var db = Seeded();
        var auth = TestHelpers.Auth(db);
        var svc = new DashboardService(TestHelpers.Uow(db), auth);
        var user = TestHelpers.User(
            TestHelpers.Perm(Permissions.GroupsView),
            TestHelpers.Perm(Permissions.EditsBadge));
        var dto = await svc.GetAsync(user);
        Assert.Equal(2, dto.GroupCount);
        Assert.Equal(3, dto.FileCount);
        Assert.Equal(20, dto.RecordCount);
        Assert.Equal(["f3", "f2", "f1"], dto.RecentFiles.Select(f => f.Name));
        Assert.Equal("g2", dto.RecentFiles[0].GroupName);
        Assert.True(dto.RecentFiles[0].HasEdits);
        Assert.False(dto.RecentFiles[1].HasEdits);
    }

    [Fact]
    public async Task ScopedUser_SeesOnlyOwnData_NoBadgeWithoutGrant()
    {
        using var db = Seeded();
        var auth = TestHelpers.Auth(db);
        var svc = new DashboardService(TestHelpers.Uow(db), auth);
        var f3 = await db.Files.FirstAsync(f => f.Name == "f3");
        var g2 = f3.GroupId;
        var user = TestHelpers.User(TestHelpers.Perm(Permissions.GroupsViewScoped, fileId: f3.Id));
        var dto = await svc.GetAsync(user);
        Assert.Equal(1, dto.GroupCount);
        Assert.Equal(1, dto.FileCount);
        Assert.Equal(10, dto.RecordCount);
        var only = Assert.Single(dto.RecentFiles);
        Assert.Equal("f3", only.Name);
        Assert.False(only.HasEdits);
        Assert.Equal(g2, only.GroupId);
    }

    [Fact]
    public async Task EmptyScope_GetsZeros_NoLeak()
    {
        using var db = Seeded();
        var auth = TestHelpers.Auth(db);
        var svc = new DashboardService(TestHelpers.Uow(db), auth);
        var dto = await svc.GetAsync(TestHelpers.User());
        Assert.Equal(0, dto.GroupCount);
        Assert.Equal(0, dto.FileCount);
        Assert.Equal(0, dto.RecordCount);
        Assert.Empty(dto.RecentFiles);
    }

    [Fact]
    public async Task Controller_RejectsAnonymous()
    {
        using var db = Seeded();
        var auth = TestHelpers.Auth(db);
        var controller = new DashboardController(new DashboardService(TestHelpers.Uow(db), auth), auth)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
        Assert.IsType<UnauthorizedObjectResult>(await controller.Get());
    }
}
