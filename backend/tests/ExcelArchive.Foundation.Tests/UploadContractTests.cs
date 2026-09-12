using ExcelArchive.Api.Controllers;
using ExcelArchive.Application.Services;
using ExcelArchive.Api.Common.Http;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.ActivityDto;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Common;
using ExcelArchive.Application.DTOs.FileDto;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using ExcelArchive.Infrastructure.Implementations.Excel;
using ExcelArchive.Infrastructure.Implementations.Storage;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FileEntity = ExcelArchive.Domain.Entities.File;
using RecordEntity = ExcelArchive.Domain.Entities.Record;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P2.2–P2.4 HTTP contract tests: workbooks validation, check-name
/// statuses, mapping shapes, replace guards, template duplicates.</summary>
public sealed class UploadContractTests : IDisposable
{
    private readonly string _storeDir;

    public UploadContractTests()
    {
        _storeDir = Path.Combine(Path.GetTempPath(), "p2contract", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_storeDir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_storeDir, recursive: true); } catch { /* best effort */ }
    }

    private sealed class StubActivity : IActivityService
    {
        public Task<ActivityResult> ListAsync(ActivityFilterRequest request, CancellationToken ct = default)
            => throw new NotImplementedException();
        public Task WriteAsync(ActivityAction action, string targetName, object? details = null, CancellationToken ct = default)
            => Task.CompletedTask;
    }

    private static T WithHttp<T>(T controller, DefaultHttpContext http) where T : ControllerBase
    {
        controller.ControllerContext = new ControllerContext { HttpContext = http };
        return controller;
    }

    private static DefaultHttpContext Authed(AppDbContext db, AuthService auth, User user)
    {
        var http = new DefaultHttpContext();
        http.Request.Headers.Cookie = $"{SessionCookie.Name}={auth.CreateSessionToken(user)}";
        return http;
    }

    private static async Task<User> SeedAdmin(AppDbContext db, AuthService auth, string name = "admin")
    {
        var user = new User { Username = name, PasswordHash = auth.HashPassword("pw"), IsActive = true };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        foreach (var key in Permissions.OwnerGlobals)
            db.UserPermissions.Add(new UserPermission { UserId = user.Id, Permission = key });
        await db.SaveChangesAsync();
        return user;
    }

    private UploadService Uploads(AppDbContext db)
    {
        return new UploadService(TestHelpers.Uow(db), new StubActivity(), new HeaderValidatorStub());
    }

    private WorkbookInspector Inspector()
    {
        var config = TestHelpers.Config();
        config["UploadStore:Path"] = _storeDir;
        return new WorkbookInspector(new WorkbookFileStore(config));
    }

    [Fact]
    public async Task Inspect_RejectsExtensionGate_AndEmpty()
    {
        using var db = TestHelpers.InMemoryDb();
        using (db)
        {
            var auth = TestHelpers.Auth(db);
            var admin = await SeedAdmin(db, auth);
            var controller = WithHttp(new WorkbooksController(Inspector(), auth), Authed(db, auth, admin));
            using var empty = new MemoryStream();
            var badExt = await controller.Inspect(new FormFile(empty, 0, 0, "file", "a.txt"));
            Assert.Equal(400, ((ObjectResult)badExt).StatusCode);
            using var xls = new MemoryStream(new byte[] { 1, 2, 3 });
            var badBytes = await controller.Inspect(new FormFile(xls, 0, 3, "file", "a.xlsx"));
            Assert.Equal(422, ((ObjectResult)badBytes).StatusCode);
        }
    }

    [Fact]
    public async Task Sheet_RequiresTokenAndName()
    {
        using var db = TestHelpers.InMemoryDb();
        using (db)
        {
            var auth = TestHelpers.Auth(db);
            var admin = await SeedAdmin(db, auth);
            var controller = WithHttp(new WorkbooksController(Inspector(), auth), Authed(db, auth, admin));
            Assert.Equal(400, ((ObjectResult)await controller.Sheet(new SheetInspectRequest(Guid.Empty, "S"))).StatusCode);
            Assert.Equal(400, ((ObjectResult)await controller.Sheet(new SheetInspectRequest(Guid.NewGuid(), ""))).StatusCode);
        }
    }

    [Fact]
    public async Task Linked_RequiresSelection()
    {
        using var db = TestHelpers.InMemoryDb();
        using (db)
        {
            var auth = TestHelpers.Auth(db);
            var admin = await SeedAdmin(db, auth);
            var controller = WithHttp(new WorkbooksController(Inspector(), auth), Authed(db, auth, admin));
            var empty = await controller.Linked(new LinkedSheetsRequest(Guid.NewGuid(), [], 1));
            Assert.Equal(400, ((ObjectResult)empty).StatusCode);
        }
    }

    [Fact]
    public async Task CheckName_Invalid_Duplicate_Available()
    {
        using var db = TestHelpers.InMemoryDb();
        using (db)
        {
            var auth = TestHelpers.Auth(db);
            var admin = await SeedAdmin(db, auth);
            var group = new Group { Name = "g" };
            db.Groups.Add(group);
            db.Files.Add(new FileEntity { GroupId = group.Id, Name = "taken", SheetName = "S" });
            await db.SaveChangesAsync();
            var files = new FileService(TestHelpers.Uow(db), new StubActivity(), TestHelpers.ColumnOrders(db), new HeaderValidatorStub());
            var controller = WithHttp(new FilesController(files, auth, new FileExportBuilderAdapter()), Authed(db, auth, admin));

            var invalid = Assert.IsType<ObjectResult>(await controller.CheckName(new CheckFileNameRequest("x")));
            Assert.Equal(400, invalid.StatusCode);
            var dup = Assert.IsType<ObjectResult>(await controller.CheckName(new CheckFileNameRequest("taken")));
            Assert.Equal(409, dup.StatusCode);
            var ok = Assert.IsType<OkObjectResult>(await controller.CheckName(new CheckFileNameRequest("free-name")));
            Assert.Equal(new CheckFileNameResponse(true), ok.Value);
        }
    }

    [Fact]
    public async Task MappingGet_SnakeKeys_Visibility()
    {
        using var db = TestHelpers.InMemoryDb();
        using (db)
        {
            var auth = TestHelpers.Auth(db);
            var admin = await SeedAdmin(db, auth);
            var group = new Group { Name = "g" };
            db.Groups.Add(group);
            await db.SaveChangesAsync();
            var file = new FileEntity { GroupId = group.Id, Name = "f", SheetName = "S" };
            db.Files.Add(file);
            await db.SaveChangesAsync();
            db.FileColumns.Add(new FileColumn
            {
                FileId = file.Id, HeaderRaw = "الاسم", HeaderNormalized = "الاسم",
                ColumnIndex = 1, StandardField = Domain.Enums.StandardField.FullName,
            });
            await db.SaveChangesAsync();
            var files = new FileService(TestHelpers.Uow(db), new StubActivity(), TestHelpers.ColumnOrders(db), new HeaderValidatorStub());
            var controller = WithHttp(new FilesController(files, auth, new FileExportBuilderAdapter()), Authed(db, auth, admin));
            var ok = Assert.IsType<OkObjectResult>(await controller.GetMapping(file.Id));
            var dto = Assert.IsType<FileMappingDto>(Assert.IsType<ApiResponse>(ok.Value).Data);
            var column = Assert.Single(dto.Columns);
            Assert.Equal("full_name", column.StandardField);

            var scoped = new User { Username = "s", PasswordHash = "x", IsActive = true };
            db.Users.Add(scoped);
            await db.SaveChangesAsync();
            var hidden = WithHttp(new FilesController(files, auth, new FileExportBuilderAdapter()), Authed(db, auth, scoped));
            Assert.IsType<NotFoundObjectResult>(await hidden.GetMapping(file.Id));
        }
    }

    [Fact]
    public async Task MappingPost_ReturnsUpdatedRecords()
    {
        using var db = TestHelpers.InMemoryDb();
        using (db)
        {
            var auth = TestHelpers.Auth(db);
            var admin = await SeedAdmin(db, auth);
            var group = new Group { Name = "g" };
            db.Groups.Add(group);
            await db.SaveChangesAsync();
            var file = new FileEntity { GroupId = group.Id, Name = "f", SheetName = "S" };
            db.Files.Add(file);
            await db.SaveChangesAsync();
            var col = new FileColumn { FileId = file.Id, HeaderRaw = "h", HeaderNormalized = "h", ColumnIndex = 1 };
            db.FileColumns.Add(col);
            db.Records.Add(new RecordEntity
            {
                FileId = file.Id, RowIndex = 2,
                Data = System.Text.Json.JsonDocument.Parse("{\"h\":\"أحمد\"}"),
            });
            await db.SaveChangesAsync();
            var files = new FileService(TestHelpers.Uow(db), new StubActivity(), TestHelpers.ColumnOrders(db), new HeaderValidatorStub());
            var controller = WithHttp(new FilesController(files, auth, new FileExportBuilderAdapter()), Authed(db, auth, admin));
            var ok = Assert.IsType<OkObjectResult>(await controller.UpdateMapping(file.Id,
                new UpdateMappingRequest([new UpdateColumnMappingDto(col.Id, "full_name", null)])));
            using var doc = System.Text.Json.JsonDocument.Parse(
                System.Text.Json.JsonSerializer.Serialize(Assert.IsType<ApiResponse>(ok.Value).Data));
            Assert.Equal(1, doc.RootElement.GetProperty("updatedRecords").GetInt32());

            var bad = await controller.UpdateMapping(file.Id,
                new UpdateMappingRequest([new UpdateColumnMappingDto(col.Id, "phone", null),
                    new UpdateColumnMappingDto(col.Id, "phone", null)]));
            Assert.Equal(400, ((ObjectResult)bad).StatusCode);
        }
    }

    [Fact]
    public async Task Template_Duplicate_Is409()
    {
        using var db = TestHelpers.InMemoryDb();
        using (db)
        {
            var auth = TestHelpers.Auth(db);
            var admin = await SeedAdmin(db, auth);
            var group = new Group { Name = "g" };
            db.Groups.Add(group);
            await db.SaveChangesAsync();
            var job = new UploadJob
            {
                Status = Domain.Enums.UploadJobStatus.Done,
                Payload = System.Text.Json.JsonDocument.Parse(
                    "{\"groupId\":\"" + group.Id + "\",\"columnSignature\":\"s\",\"columns\":[]}"),
            };
            db.UploadJobs.Add(job);
            await db.SaveChangesAsync();
            var controller = WithHttp(
                new UploadJobsController(Uploads(db), auth, new GroupService(TestHelpers.Uow(db), new StubActivity(), auth)), Authed(db, auth, admin));
            Assert.IsType<OkObjectResult>(await controller.SaveTemplate(job.Id, new SaveTemplateRequest("tpl")));
            var dup = Assert.IsType<ObjectResult>(
                await controller.SaveTemplate(job.Id, new SaveTemplateRequest("tpl")));
            Assert.Equal(409, dup.StatusCode);
            var bad = Assert.IsType<ObjectResult>(
                await controller.SaveTemplate(job.Id, new SaveTemplateRequest("x")));
            Assert.Equal(400, ((ObjectResult)bad).StatusCode);
        }
    }

    [Fact]
    public async Task Replace_SameStructureMismatch_Is409()
    {
        using var db = TestHelpers.InMemoryDb();
        using (db)
        {
            var auth = TestHelpers.Auth(db);
            var admin = await SeedAdmin(db, auth);
            var group = new Group { Name = "g" };
            db.Groups.Add(group);
            await db.SaveChangesAsync();
            var file = new FileEntity { GroupId = group.Id, Name = "f", SheetName = "S" };
            db.Files.Add(file);
            await db.SaveChangesAsync();
            db.FileColumns.Add(new FileColumn
            {
                FileId = file.Id, HeaderRaw = "a", HeaderNormalized = "a", ColumnIndex = 1,
            });
            await db.SaveChangesAsync();
            var files = new FileService(TestHelpers.Uow(db), new StubActivity(), TestHelpers.ColumnOrders(db), new HeaderValidatorStub());
            var controller = WithHttp(new FilesController(files, auth, new FileExportBuilderAdapter()), Authed(db, auth, admin));
            var token = Guid.NewGuid();
            var mismatch = Assert.IsType<ObjectResult>(await controller.Replace(file.Id,
                new ReplaceFileRequest("n.xlsx", "S", 1, 0, null, "same",
                    [new ReplaceColumnDto("b", "b", 1, null, null)], null, token)));
            Assert.Equal(409, mismatch.StatusCode);
            var missing = Assert.IsType<NotFoundObjectResult>(
                await controller.Replace(Guid.NewGuid(),
                    new ReplaceFileRequest("n.xlsx", "S", 1, 0, null, "same",
                        [new ReplaceColumnDto("a", "a", 1, null, null)], null, token)));
            Assert.Equal(404, missing.StatusCode);
        }
    }

    private sealed class HeaderValidatorStub : ExcelArchive.Application.Interfaces.Excel.IHeaderMappingValidator
    {
        public string? LinkedMappingError(string sheetName, int sheetIndex, IReadOnlyList<string>? supplementalNames, int nationalIdColumnIndex, IReadOnlyList<ExcelArchive.Application.DTOs.UploadDto.InspectedColumn> columns) => null;
    }
}
