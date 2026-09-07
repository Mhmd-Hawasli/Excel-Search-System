using System.Text.Json;
using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Auth;
using ExcelArchive.Api.DTOs.Common;
using ExcelArchive.Api.Services.Abstractions;
using ExcelArchive.Api.Services.Smart;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Services;

public class SearchService(AppDbContext db) : ISearchService
{
    public async Task<PageResult<SearchResultDto>> SearchAsync(SearchRequest request, DataScopeDto scope, CancellationToken ct = default)
    {
        var query = db.Records.AsNoTracking().Include(r => r.File).ThenInclude(f => f.Group).AsQueryable();

        if (scope.GroupIds is not null)
            query = query.Where(r => scope.GroupIds.Contains(r.File.GroupId));
        if (scope.FileIds is not null)
            query = query.Where(r => scope.FileIds.Contains(r.FileId));

        if (request.GroupIds is { Count: > 0 }) query = query.Where(r => request.GroupIds.Contains(r.File.GroupId));
        if (request.FileIds is { Count: > 0 }) query = query.Where(r => request.FileIds.Contains(r.FileId));

        var term = request.Query?.Trim();
        if (!string.IsNullOrWhiteSpace(term))
        {
            var normalized = ArabicNormalization.Normalize(term);
            var pattern = $"%{normalized}%";
            query = request.Field switch
            {
                "name" => query.Where(r =>
                    EF.Functions.ILike(r.NFullName ?? "", pattern) ||
                    EF.Functions.ILike(r.SfFullName ?? "", pattern) ||
                    EF.Functions.ILike(r.SfFirstName ?? "", pattern) ||
                    EF.Functions.ILike(r.SfLastName ?? "", pattern)),
                "nationalId" => query.Where(r =>
                    EF.Functions.ILike(r.DNationalId ?? "", pattern) ||
                    (r.SfNationalId != null && r.SfNationalId.ToString().Contains(term))),
                "phone" => query.Where(r => EF.Functions.ILike(r.SfPhone ?? "", pattern) ||
                                            EF.Functions.ILike(r.DPhone ?? "", pattern)),
                _ => query.Where(r =>
                    EF.Functions.ILike(r.NFullName ?? "", pattern) ||
                    EF.Functions.ILike(r.DNationalId ?? "", pattern) ||
                    EF.Functions.ILike(r.SfPhone ?? "", pattern) ||
                    EF.Functions.ILike(r.SfPersonalNo ?? "", pattern) ||
                    EF.Functions.ILike(r.SfContractCode ?? "", pattern))
            };
        }

        var total = await query.CountAsync(ct);
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 200);
        var rows = await query.OrderBy(r => r.File.Group.SortOrder)
            .ThenBy(r => r.File.Name)
            .ThenBy(r => r.RowIndex)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        var items = rows.Select(r => new SearchResultDto(r.Id, r.FileId, r.File.Name, r.File.GroupId,
            r.File.Group.Name, r.RowIndex, r.SfFullName, r.DNationalId, r.SfPhone, ToDictionary(r.Data.RootElement))).ToList();
        return new PageResult<SearchResultDto>
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            Total = total,
        };
    }

    private static IReadOnlyDictionary<string, object?> ToDictionary(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object) return new Dictionary<string, object?>();
        var result = new Dictionary<string, object?>();
        foreach (var prop in element.EnumerateObject())
        {
            result[prop.Name] = prop.Value.ValueKind == JsonValueKind.String
                ? prop.Value.GetString()
                : prop.Value.ValueKind == JsonValueKind.Number
                    ? prop.Value.GetInt64()
                    : prop.Value.GetRawText();
        }
        return result;
    }
}
