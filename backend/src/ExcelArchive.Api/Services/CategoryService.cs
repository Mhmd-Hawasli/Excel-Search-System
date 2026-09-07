using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Categories;
using ExcelArchive.Api.Models.Entities;
using ExcelArchive.Api.Models.Enums;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Services;

public class CategoryService(AppDbContext db, IActivityService activity) : ICategoryService
{
    public async Task<IReadOnlyList<CategoryDto>> ListAsync(CancellationToken ct = default)
    {
        var rows = await db.Categories.AsNoTracking().OrderBy(x => x.SortOrder).ThenBy(x => x.CreatedAt).ToListAsync(ct);
        return rows.Select(ToDto).ToList();
    }

    public async Task<CategoryDto> CreateAsync(CreateCategoryRequest request, string actorUsername, CancellationToken ct = default)
    {
        var last = await db.Categories.MaxAsync(x => (int?)x.SortOrder, ct) ?? -1;
        var category = new Category { Name = request.Name.Trim(), SortOrder = last + 1 };
        db.Categories.Add(category);
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.CategoryCreated, category.Name, new { by = actorUsername }, ct);
        return ToDto(category);
    }

    public async Task<CategoryDto> UpdateAsync(Guid id, UpdateCategoryRequest request, string actorUsername, CancellationToken ct = default)
    {
        var category = await db.Categories.FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new KeyNotFoundException("غير موجود.");
        category.Name = request.Name.Trim();
        db.Categories.Update(category);
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.CategoryUpdated, category.Name, new { by = actorUsername }, ct);
        return ToDto(category);
    }

    public async Task ReorderAsync(Guid id, string direction, string actorUsername, CancellationToken ct = default)
    {
        var categories = await db.Categories.OrderBy(x => x.SortOrder).ThenBy(x => x.CreatedAt).ToListAsync(ct);
        var index = categories.FindIndex(x => x.Id == id);
        var swapIndex = direction == "up" ? index - 1 : index + 1;
        if (index < 0 || swapIndex < 0 || swapIndex >= categories.Count)
            throw new InvalidOperationException("لا يمكن نقل الفئة في هذا الاتجاه.");
        (categories[index].SortOrder, categories[swapIndex].SortOrder) = (categories[swapIndex].SortOrder, categories[index].SortOrder);
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.CategoryReordered, categories[index].Name, new { direction, by = actorUsername }, ct);
    }

    public async Task MoveColumnAsync(Guid columnId, Guid? categoryId, string actorUsername, CancellationToken ct = default)
    {
        var column = await db.FileColumns.FirstOrDefaultAsync(x => x.Id == columnId, ct)
            ?? throw new KeyNotFoundException("غير موجود.");
        column.CategoryId = categoryId;
        db.FileColumns.Update(column);
        if (categoryId is not null && !await db.Categories.AnyAsync(c => c.Id == categoryId, ct))
            throw new InvalidOperationException("الفئة المحددة غير موجودة.");
        await db.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.ColumnRecategorized, column.HeaderRaw, new { categoryId, by = actorUsername }, ct);
    }

    private static CategoryDto ToDto(Category x) => new(x.Id, x.Name, x.SortOrder, x.CreatedAt);
}
