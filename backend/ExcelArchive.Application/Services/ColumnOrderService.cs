using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Domain.Enums;

namespace ExcelArchive.Application.Services;

public sealed class ColumnOrderService(IUnitOfWork uow) : IColumnOrderService
{
    public async Task<IReadOnlyList<int>> AssignAsync(
        IReadOnlyList<(Guid? CategoryId, StandardField? Field)> placements,
        CancellationToken ct = default)
    {
        var bottom = new Dictionary<string, int>(StringComparer.Ordinal);
        var standardWeights = new Dictionary<string, int>(StringComparer.Ordinal);
        async Task<int> TakeBottom(Guid? categoryId)
        {
            var bucket = categoryId?.ToString("D") ?? "other";
            if (!bottom.TryGetValue(bucket, out var next))
            {
                var max = await uow.FileColumns.MaxSortOrderAsync(categoryId, ct);
                next = (max ?? -1) + 1;
            }
            bottom[bucket] = next + 1;
            return next;
        }
        var weights = new List<int>(placements.Count);
        foreach (var (categoryId, standard) in placements)
        {
            if (standard is null)
            {
                weights.Add(await TakeBottom(categoryId));
                continue;
            }
            var key = $"{categoryId:D}:{standard}";
            if (!standardWeights.TryGetValue(key, out var weight))
            {
                var existing = await uow.FileColumns.FirstSortOrderAsync(categoryId, standard.Value, ct);
                weight = existing ?? await TakeBottom(categoryId);
                standardWeights[key] = weight;
            }
            weights.Add(weight);
        }
        return weights;
    }
}
