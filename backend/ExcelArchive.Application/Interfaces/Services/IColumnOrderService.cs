using ExcelArchive.Domain.Enums;

namespace ExcelArchive.Application.Interfaces.Services;

/// <summary>
/// Column sort-order assignment (V1 categories/column-order.ts): standard
/// fields reuse the existing weight of their (category, field) group,
/// custom columns go to the bottom.
/// </summary>
public interface IColumnOrderService
{
    Task<IReadOnlyList<int>> AssignAsync(
        IReadOnlyList<(Guid? CategoryId, StandardField? Field)> placements,
        CancellationToken ct = default);
}
