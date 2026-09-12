using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Services;
using ExcelArchive.Application.DTOs.CategoryDto;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;
using FileEntity = ExcelArchive.Domain.Entities.File;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P6.1: category validation (2–100 chars, 7 max, duplicates),
/// up/down reorder, typed delete with أخرى reassignment, single-column move
/// (validation, no-op, standard-weight reuse) and global column-group reorder.
/// Mirrors V1 lib/actions/categories.ts behavior.</summary>
public sealed class CategoryPhase6Tests
{
    private static (AppDbContext Db, CategoryService Svc) Setup()
    {
        var db = TestHelpers.InMemoryDb();
        return (db, new CategoryService(TestHelpers.Uow(db), new ActivityService(TestHelpers.Uow(db)), TestHelpers.ColumnOrders(db)));
    }

    private static async Task<Guid> SeedColumn(AppDbContext db, Guid? categoryId = null,
        StandardField? standard = null, int sortOrder = 0, int columnIndex = 1)
    {
        var group = new Group { Name = "cg" + Guid.NewGuid().ToString("N")[..6] };
        db.Groups.Add(group);
        await db.SaveChangesAsync();
        var file = new FileEntity { GroupId = group.Id, Name = "cf" + Guid.NewGuid().ToString("N")[..6], SheetName = "S" };
        db.Files.Add(file);
        await db.SaveChangesAsync();
        var column = new FileColumn
        {
            FileId = file.Id, HeaderRaw = "h" + columnIndex, HeaderNormalized = "h" + columnIndex,
            ColumnIndex = columnIndex, SortOrder = sortOrder, CategoryId = categoryId, StandardField = standard,
        };
        db.FileColumns.Add(column);
        await db.SaveChangesAsync();
        return column.Id;
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("أ")]
    public async Task Create_NameTooShort_Rejects400(string name)
    {
        var (_, svc) = Setup();
        var ex = await Assert.ThrowsAsync<InvalidDataException>(() => svc.CreateAsync(new CreateCategoryRequest(name), "tester"));
        Assert.Equal("اسم الفئة قصير جدًا.", ex.Message);
    }

    [Fact]
    public async Task Create_NameTooLong_Rejects400()
    {
        var (_, svc) = Setup();
        var ex = await Assert.ThrowsAsync<InvalidDataException>(
            () => svc.CreateAsync(new CreateCategoryRequest(new string('أ', 101)), "tester"));
        Assert.Equal("اسم الفئة طويل جدًا.", ex.Message);
    }

    [Fact]
    public async Task Create_Duplicate_Rejects422()
    {
        var (_, svc) = Setup();
        await svc.CreateAsync(new CreateCategoryRequest("فئة أ"), "tester");
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => svc.CreateAsync(new CreateCategoryRequest("فئة أ"), "tester"));
        Assert.Equal("توجد فئة بهذا الاسم بالفعل.", ex.Message);
    }

    [Fact]
    public async Task Create_SevenMax_EighthRejected()
    {
        var (_, svc) = Setup();
        for (var i = 0; i < 7; i++)
            await svc.CreateAsync(new CreateCategoryRequest($"فئة {i}"), "tester");
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => svc.CreateAsync(new CreateCategoryRequest("فئة زائدة"), "tester"));
        Assert.Equal(CategoryService.LimitMessage, ex.Message);
    }

    [Fact]
    public async Task Update_DuplicateAndMissing()
    {
        var (_, svc) = Setup();
        var a = await svc.CreateAsync(new CreateCategoryRequest("أولى"), "tester");
        var b = await svc.CreateAsync(new CreateCategoryRequest("ثانية"), "tester");
        var dup = await Assert.ThrowsAsync<InvalidOperationException>(
            () => svc.UpdateAsync(b.Id, new UpdateCategoryRequest("أولى"), "tester"));
        Assert.Equal("توجد فئة بهذا الاسم بالفعل.", dup.Message);
        var missing = await Assert.ThrowsAsync<KeyNotFoundException>(
            () => svc.UpdateAsync(Guid.NewGuid(), new UpdateCategoryRequest("ثالثة"), "tester"));
        Assert.Equal("الفئة غير موجودة.", missing.Message);
        _ = a;
    }

    [Fact]
    public async Task Reorder_UpDownSwap_BoundaryRejected()
    {
        var (_, svc) = Setup();
        var a = await svc.CreateAsync(new CreateCategoryRequest("فئة أ"), "tester");
        var b = await svc.CreateAsync(new CreateCategoryRequest("فئة ب"), "tester");
        await svc.ReorderAsync(a.Id, "down", "tester");
        var order = (await svc.ListAsync()).Select(c => c.Name).ToList();
        Assert.Equal(["فئة ب", "فئة أ"], order);
        var edge = await Assert.ThrowsAsync<InvalidOperationException>(
            () => svc.ReorderAsync(a.Id, "down", "tester"));
        Assert.Equal("لا يمكن نقل الفئة في هذا الاتجاه.", edge.Message);
        var bad = await Assert.ThrowsAsync<InvalidDataException>(
            () => svc.ReorderAsync(a.Id, "sideways", "tester"));
        Assert.Equal("اتجاه الترتيب غير صالح.", bad.Message);
    }

    [Fact]
    public async Task Delete_WrongConfirm_Rejects_ThenMovesColumnsToOther()
    {
        var (db, svc) = Setup();
        var cat = await svc.CreateAsync(new CreateCategoryRequest("للحذف"), "tester");
        var colId = await SeedColumn(db, cat.Id, StandardField.NationalId, sortOrder: 5);
        var wrong = await Assert.ThrowsAsync<InvalidOperationException>(
            () => svc.DeleteAsync(cat.Id, "اسم خاطئ", "tester"));
        Assert.Equal("اسم التأكيد لا يطابق اسم الفئة.", wrong.Message);
        await svc.DeleteAsync(cat.Id, "للحذف", "tester");
        Assert.Empty(await svc.ListAsync());
        var column = await db.FileColumns.FirstAsync(c => c.Id == colId);
        Assert.Null(column.CategoryId);
    }

    [Fact]
    public async Task MoveColumn_Validation_Noop_AndStandardMessage()
    {
        var (db, svc) = Setup();
        var cat = await svc.CreateAsync(new CreateCategoryRequest("مستهدفة"), "tester");
        var colId = await SeedColumn(db, null, StandardField.NationalId);
        var bad = await Assert.ThrowsAsync<InvalidDataException>(
            () => svc.MoveColumnAsync(Guid.Empty, cat.Id, "tester"));
        Assert.Equal("معرف العمود غير صالح.", bad.Message);
        var missing = await Assert.ThrowsAsync<KeyNotFoundException>(
            () => svc.MoveColumnAsync(Guid.NewGuid(), cat.Id, "tester"));
        Assert.Equal("العمود غير موجود.", missing.Message);
        var gone = await Assert.ThrowsAsync<InvalidOperationException>(
            () => svc.MoveColumnAsync(colId, Guid.NewGuid(), "tester"));
        Assert.Equal("الفئة المستهدفة لم تعد موجودة.", gone.Message);
        var moved = await svc.MoveColumnAsync(colId, cat.Id, "tester");
        Assert.Contains("الحقل القياسي", moved);
        var noop = await svc.MoveColumnAsync(colId, cat.Id, "tester");
        Assert.Equal("العمود موجود ضمن هذه الفئة بالفعل.", noop);
        var toOther = await svc.MoveColumnAsync(colId, null, "tester");
        Assert.Contains("أخرى", toOther);
    }

    [Fact]
    public async Task ReorderColumnGroups_HappyAndMismatch()
    {
        var (db, svc) = Setup();
        var cat = await svc.CreateAsync(new CreateCategoryRequest("مرتبة"), "tester");
        var c1 = await SeedColumn(db, cat.Id, StandardField.NationalId, sortOrder: 0, columnIndex: 1);
        var c2 = await SeedColumn(db, cat.Id, StandardField.MotherName, sortOrder: 1, columnIndex: 2);
        var board = (await svc.BoardAsync()).First(b => b.CategoryId == cat.Id);
        Assert.Equal(2, board.Groups.Count);
        var reversed = board.Groups.Select(g => g.Key).Reverse().ToList();
        await svc.ReorderColumnGroupsAsync(cat.Id, reversed, "tester");
        var cols = await db.FileColumns.Where(c => c.CategoryId == cat.Id)
            .OrderBy(c => c.SortOrder).Select(c => c.Id).ToListAsync();
        Assert.Equal(reversed.SelectMany(k =>
            board.Groups.First(g => g.Key == k).Columns.Select(c => c.Id)).ToList(), cols);
        var bad = await Assert.ThrowsAsync<InvalidOperationException>(
            () => svc.ReorderColumnGroupsAsync(cat.Id, ["standard:national_id"], "tester"));
        Assert.Equal("تغيّرت أعمدة الفئة. حدّث الصفحة ثم أعد المحاولة.", bad.Message);
        var gone = await Assert.ThrowsAsync<KeyNotFoundException>(
            () => svc.ReorderColumnGroupsAsync(Guid.NewGuid(), reversed, "tester"));
        Assert.Equal("الفئة لم تعد موجودة.", gone.Message);
        _ = (c1, c2);
    }

    [Fact]
    public async Task Board_GroupsStandardAndCustomSeparately()
    {
        var (db, svc) = Setup();
        var cat = await svc.CreateAsync(new CreateCategoryRequest("لوحة"), "tester");
        await SeedColumn(db, cat.Id, StandardField.NationalId, columnIndex: 1);
        await SeedColumn(db, cat.Id, null, columnIndex: 2);
        var board = (await svc.BoardAsync()).First(b => b.CategoryId == cat.Id);
        Assert.Contains(board.Groups, g => g.Key == "standard:national_id");
        Assert.Contains(board.Groups, g => g.Key.StartsWith("column:", StringComparison.Ordinal));
    }
}
