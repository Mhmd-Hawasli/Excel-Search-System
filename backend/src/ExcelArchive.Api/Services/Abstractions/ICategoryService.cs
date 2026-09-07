using ExcelArchive.Api.DTOs.Categories;

namespace ExcelArchive.Api.Services.Abstractions;

public interface ICategoryService
{
    Task<IReadOnlyList<CategoryDto>> ListAsync(CancellationToken ct = default);
    Task<CategoryDto> CreateAsync(CreateCategoryRequest request, string actorUsername, CancellationToken ct = default);
    Task<CategoryDto> UpdateAsync(Guid id, UpdateCategoryRequest request, string actorUsername, CancellationToken ct = default);
    Task ReorderAsync(Guid id, string direction, string actorUsername, CancellationToken ct = default);
    Task MoveColumnAsync(Guid columnId, Guid? categoryId, string actorUsername, CancellationToken ct = default);
}
