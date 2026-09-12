using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Services;
using ExcelArchive.Application.DTOs.ActivityDto;
using ExcelArchive.Application.DTOs.FileDto;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;
using FileEntity = ExcelArchive.Domain.Entities.File;
using RecordEntity = ExcelArchive.Domain.Entities.Record;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P2.4 remap tests mirroring V1 update-mapping-service behavior.</summary>
public sealed class RemapTests
{
    private sealed class StubActivity : IActivityService
    {
        public readonly List<ActivityAction> Writes = [];
        public Task<ActivityResult> ListAsync(ActivityFilterRequest request, CancellationToken ct = default)
            => throw new NotImplementedException();
        public Task WriteAsync(ActivityAction action, string targetName, object? details = null, CancellationToken ct = default)
        {
            Writes.Add(action);
            return Task.CompletedTask;
        }
    }

    private static async Task<(AppDbContext Db, FileService Files, Guid FileId, Guid ColA, Guid ColB)> Seeded()
    {
        var db = TestHelpers.InMemoryDb();
        var group = new Group { Name = "g" };
        db.Groups.Add(group);
        await db.SaveChangesAsync();
        var file = new FileEntity { GroupId = group.Id, Name = "f", SheetName = "S" };
        db.Files.Add(file);
        await db.SaveChangesAsync();
        var colA = new FileColumn { FileId = file.Id, HeaderRaw = "الاسم", HeaderNormalized = "الاسم", ColumnIndex = 1, StandardField = StandardField.FullName };
        var colB = new FileColumn { FileId = file.Id, HeaderRaw = "الام", HeaderNormalized = "الام", ColumnIndex = 2, StandardField = StandardField.MotherName };
        db.FileColumns.AddRange(colA, colB);
        var doc = System.Text.Json.JsonDocument.Parse("{\"الاسم\":\"أحمد\",\"الام\":\"فاطمة\"}");
        db.Records.Add(new RecordEntity { FileId = file.Id, RowIndex = 2, Data = doc });
        await db.SaveChangesAsync();
        return (db, new FileService(TestHelpers.Uow(db), new StubActivity(), TestHelpers.ColumnOrders(db), new HeaderValidatorStub()), file.Id, colA.Id, colB.Id);
    }

    [Fact]
    public async Task SwapFields_UpdatesShadowsAndQuality_ReturnsCount()
    {
        var (db, files, fileId, colA, colB) = await Seeded();
        using (db)
        {
            var updated = await files.UpdateMappingAsync(fileId, new UpdateMappingRequest([
                new UpdateColumnMappingDto(colA, "mother_name", null),
                new UpdateColumnMappingDto(colB, "full_name", null),
            ]), "admin");
            Assert.Equal(1, updated);
            var record = await db.Records.FirstAsync();
            Assert.Equal("أحمد", record.SfMotherName);
            Assert.Equal("فاطمة", record.SfFullName);
            Assert.Null(record.NationalIdNum);
        }
    }

    [Fact]
    public async Task RemoveMapping_ClearsShadows()
    {
        var (db, files, fileId, colA, colB) = await Seeded();
        using (db)
        {
            await files.UpdateMappingAsync(fileId, new UpdateMappingRequest([
                new UpdateColumnMappingDto(colA, null, null),
                new UpdateColumnMappingDto(colB, "mother_name", null),
            ]), "admin");
            var record = await db.Records.FirstAsync();
            Assert.Null(record.SfFullName);
            Assert.Equal("فاطمة", record.SfMotherName);
        }
    }

    [Fact]
    public async Task Ownership_CountMismatch_ForeignId_Duplicate_UnknownCategory()
    {
        var (db, files, fileId, colA, colB) = await Seeded();
        using (db)
        {
            var count = await Assert.ThrowsAsync<InvalidDataException>(() => files.UpdateMappingAsync(fileId,
                new UpdateMappingRequest([new UpdateColumnMappingDto(colA, null, null)]), "admin"));
            Assert.Equal("عدد الأعمدة المرسلة لا يطابق عدد أعمدة الملف.", count.Message);
            var foreign = await Assert.ThrowsAsync<InvalidDataException>(() => files.UpdateMappingAsync(fileId,
                new UpdateMappingRequest([
                    new UpdateColumnMappingDto(Guid.NewGuid(), null, null),
                    new UpdateColumnMappingDto(colB, null, null)]), "admin"));
            Assert.Equal("أحد الأعمدة لا ينتمي لهذا الملف.", foreign.Message);
            var dup = await Assert.ThrowsAsync<InvalidDataException>(() => files.UpdateMappingAsync(fileId,
                new UpdateMappingRequest([
                    new UpdateColumnMappingDto(colA, "phone", null),
                    new UpdateColumnMappingDto(colB, "phone", null)]), "admin"));
            Assert.Equal("لا يمكن ربط حقل قياسي واحد بأكثر من عمود.", dup.Message);
            var cat = await Assert.ThrowsAsync<InvalidDataException>(() => files.UpdateMappingAsync(fileId,
                new UpdateMappingRequest([
                    new UpdateColumnMappingDto(colA, null, Guid.NewGuid()),
                    new UpdateColumnMappingDto(colB, null, null)]), "admin"));
            Assert.Equal("إحدى الفئات غير موجودة.", cat.Message);
            var unknown = await Assert.ThrowsAsync<InvalidDataException>(() => files.UpdateMappingAsync(fileId,
                new UpdateMappingRequest([
                    new UpdateColumnMappingDto(colA, "nope", null),
                    new UpdateColumnMappingDto(colB, null, null)]), "admin"));
            Assert.Equal("حقل قياسي غير معروف: nope", unknown.Message);
        }
    }

    [Fact]
    public async Task Remap_RebuildsQuality_PreservesEmptyRows()
    {
        var (db, files, fileId, colA, colB) = await Seeded();
        using (db)
        {
            db.DataQualityIssues.Add(new DataQualityIssue
            {
                FileId = fileId, RowIndex = 9, IssueType = DataQualityIssueType.EmptyRow,
            });
            await db.SaveChangesAsync();
            await files.UpdateMappingAsync(fileId, new UpdateMappingRequest([
                new UpdateColumnMappingDto(colA, "national_id", null),
                new UpdateColumnMappingDto(colB, null, null),
            ]), "admin");
            var issues = await db.DataQualityIssues.ToListAsync();
            // Old non-empty issues rebuilt; the empty-row marker survives.
            Assert.Contains(issues, i => i.IssueType == DataQualityIssueType.EmptyRow);
            Assert.Contains(issues, i => i.IssueType == DataQualityIssueType.InvalidNationalId);
            var record = await db.Records.FirstAsync();
            Assert.Null(record.NationalIdNum);
        }
    }

    private sealed class HeaderValidatorStub : ExcelArchive.Application.Interfaces.Excel.IHeaderMappingValidator
    {
        public string? LinkedMappingError(string sheetName, int sheetIndex, IReadOnlyList<string>? supplementalNames, int nationalIdColumnIndex, IReadOnlyList<ExcelArchive.Application.DTOs.UploadDto.InspectedColumn> columns) => null;
    }
}
