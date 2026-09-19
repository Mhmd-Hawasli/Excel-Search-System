using ExcelArchive.Api.Controllers;
using ExcelArchive.Application.DTOs.BulkSearchDto;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Services;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Foundation.Tests;

/// <summary>Bulk export builds the workbook directly from the run's rows:
/// no re-search, no server-side file.</summary>
public sealed class BulkSearchExportTests
{
    private sealed class StubBulk : IBulkSearchService
    {
        public BulkSearchInspection Inspect(byte[] content, string fileName)
            => throw new NotImplementedException();
        public BulkSearchSelectedSheet InspectSheet(Guid token, string sheetName)
            => throw new NotImplementedException();
        public Task<BulkSearchResult> RunAsync(
            BulkSearchRunArgs args,
            IReadOnlyList<Guid> groupIds, IReadOnlyList<Guid> fileIds,
            IReadOnlyList<Guid>? allowedFileIds,
            Action<int, string?>? onProgress = null, CancellationToken ct = default)
            => throw new NotImplementedException();
    }

    private static async Task<(AuthService Auth, User User)> SeedAsync(AppDbContext db)
    {
        var auth = TestHelpers.Auth(db);
        var user = new User { Username = "admin", PasswordHash = auth.HashPassword("pw"), IsActive = true };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        foreach (var key in Permissions.OwnerGlobals)
            db.UserPermissions.Add(new UserPermission { UserId = user.Id, Permission = key });
        await db.SaveChangesAsync();
        return (auth, user);
    }

    private static BulkSearchController Controller(AuthService auth, User user)
    {
        var http = new DefaultHttpContext();
        http.Request.Headers.Cookie =
            $"{ExcelArchive.Api.Common.Http.SessionCookie.Name}={auth.CreateSessionToken(user)}";
        return new BulkSearchController(auth, new StubBulk())
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };
    }

    private static BulkSearchExportRow ExportRow(int sequence, string query, int percent = 100)
        => new(sequence, query, "full_name", "ملف العقود", sequence * 10,
            "محمد محمد شاكر حواصلي", "12345678912", "1234123412341234", "12345678912", percent);

    [Fact]
    public async Task EmptyRows_Is400()
    {
        using var db = TestHelpers.InMemoryDb();
        var (auth, user) = await SeedAsync(db);
        var result = await Controller(auth, user).Export(new BulkSearchExportRequest([]));
        var bad = Assert.IsType<ObjectResult>(result);
        Assert.Equal(400, bad.StatusCode);
    }

    [Fact]
    public async Task ValidRows_ReturnsXlsxWithoutSearch()
    {
        using var db = TestHelpers.InMemoryDb();
        var (auth, user) = await SeedAsync(db);
        var result = await Controller(auth, user).Export(new BulkSearchExportRequest(
            [ExportRow(1, "محمد حواصلي"), ExportRow(2, "كريم زينو", 86)]));
        var file = Assert.IsType<FileContentResult>(result);
        Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file.ContentType);
        using var wb = new ClosedXML.Excel.XLWorkbook(new MemoryStream(file.FileContents));
        var ws = wb.Worksheets.Single();
        Assert.Equal("التسلسل", ws.Cell(1, 1).GetString());
        Assert.Equal("نسبة التطابق", ws.Cell(1, 10).GetString());
        Assert.Equal("محمد حواصلي", ws.Cell(2, 2).GetString());
        Assert.Equal("100%", ws.Cell(2, 10).GetString());
        Assert.Equal(2, ws.Cell(3, 1).GetValue<int>());
        Assert.Equal("86%", ws.Cell(3, 10).GetString());
        Assert.True(ws.LastRowUsed()!.RowNumber() == 3);
    }

    [Fact]
    public async Task UnmatchedValues_ExportedAsBlankRowsInSequenceOrder()
    {
        using var db = TestHelpers.InMemoryDb();
        var (auth, user) = await SeedAsync(db);
        var result = await Controller(auth, user).Export(new BulkSearchExportRequest(
            [ExportRow(1, "محمد حواصلي"), ExportRow(3, "أحمد خالد العلي")],
            [new BulkSearchExportUnmatched(2, "غريب لا يوجد", "full_name")]));
        var file = Assert.IsType<FileContentResult>(result);
        using var wb = new ClosedXML.Excel.XLWorkbook(new MemoryStream(file.FileContents));
        var ws = wb.Worksheets.Single();
        // Sequence order 1, 2 (blank), 3.
        Assert.Equal(1, ws.Cell(2, 1).GetValue<int>());
        Assert.Equal(2, ws.Cell(3, 1).GetValue<int>());
        Assert.Equal("غريب لا يوجد", ws.Cell(3, 2).GetString());
        Assert.Equal("", ws.Cell(3, 4).GetString());
        Assert.Equal("", ws.Cell(3, 5).GetString());
        Assert.Equal("", ws.Cell(3, 6).GetString());
        Assert.Equal("", ws.Cell(3, 10).GetString());
        Assert.Equal(3, ws.Cell(4, 1).GetValue<int>());
        Assert.Equal("أحمد خالد العلي", ws.Cell(4, 2).GetString());
        Assert.True(ws.LastRowUsed()!.RowNumber() == 4);
    }

    [Fact]
    public async Task OnlyUnmatched_ReturnsWorkbookWithBlankRows()
    {
        using var db = TestHelpers.InMemoryDb();
        var (auth, user) = await SeedAsync(db);
        var result = await Controller(auth, user).Export(new BulkSearchExportRequest(
            [],
            [new BulkSearchExportUnmatched(1, "غريب لا يوجد", "full_name")]));
        var file = Assert.IsType<FileContentResult>(result);
        using var wb = new ClosedXML.Excel.XLWorkbook(new MemoryStream(file.FileContents));
        var ws = wb.Worksheets.Single();
        Assert.Equal(1, ws.Cell(2, 1).GetValue<int>());
        Assert.Equal("غريب لا يوجد", ws.Cell(2, 2).GetString());
        Assert.Equal("", ws.Cell(2, 4).GetString());
        Assert.True(ws.LastRowUsed()!.RowNumber() == 2);
    }
}
