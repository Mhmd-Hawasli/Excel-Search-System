using ExcelArchive.Application.DTOs.CategoryDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface ICategoryService
{
    Task<IReadOnlyList<CategoryDto>> ListAsync(CancellationToken ct = default);
    Task<IReadOnlyList<CategoryBoardDto>> BoardAsync(CancellationToken ct = default);
    Task<CategoryDto> CreateAsync(CreateCategoryRequest request, string actorUsername, CancellationToken ct = default);
    Task<CategoryDto> UpdateAsync(Guid id, UpdateCategoryRequest request, string actorUsername, CancellationToken ct = default);
    Task ReorderAsync(Guid id, string direction, string actorUsername, CancellationToken ct = default);
    Task DeleteAsync(Guid id, string confirmName, string actorUsername, CancellationToken ct = default);
    Task<string> MoveColumnAsync(Guid columnId, Guid? categoryId, string actorUsername, CancellationToken ct = default);
    Task ReorderColumnGroupsAsync(Guid? categoryId, IReadOnlyList<string> orderedGroupKeys, string actorUsername, CancellationToken ct = default);
}
