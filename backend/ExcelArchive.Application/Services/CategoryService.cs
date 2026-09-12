using ExcelArchive.Application.DTOs.CategoryDto;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Services;

namespace ExcelArchive.Application.Services;

public class CategoryService(IUnitOfWork uow, IActivityService activity, IColumnOrderService columns) : ICategoryService
{
    public const int MaxCustomCategories = 7;
    public const string LimitMessage = "الحد الأقصى هو 7 فئات مخصصة بالإضافة إلى فئة «أخرى».";

    public async Task<IReadOnlyList<CategoryDto>> ListAsync(CancellationToken ct = default)
    {
        var rows = await uow.Categories.ListOrderedAsync(ct);
        return rows.Select(ToDto).ToList();
    }

    public async Task<IReadOnlyList<CategoryBoardDto>> BoardAsync(CancellationToken ct = default)
    {
        var categories = await uow.Categories.ListOrderedAsync(ct);
        var columns = await uow.FileColumns.ListOrderedWithGraphAsync(ct);
        // Dictionary<Guid?, …> throws on a null lookup, and uncategorized
        // columns (CategoryId null) are the common case after fresh uploads —
        // bucket them separately instead of keying the dictionary by null.
        var byCategory = new Dictionary<Guid, List<Domain.Entities.FileColumn>>();
        List<Domain.Entities.FileColumn>? uncategorized = null;
        foreach (var column in columns)
        {
            if (column.CategoryId is null)
            {
                (uncategorized ??= []).Add(column);
                continue;
            }
            if (!byCategory.TryGetValue(column.CategoryId.Value, out var list))
                byCategory[column.CategoryId.Value] = list = [];
            list.Add(column);
        }
        var buckets = new List<(Guid? CategoryId, List<Domain.Entities.FileColumn> Columns)>();
        if (uncategorized is not null) buckets.Add((null, uncategorized));
        buckets.AddRange(byCategory.Select(entry => ((Guid?)entry.Key, entry.Value)));
        var result = new List<CategoryBoardDto>();
        foreach (var (categoryId, bucket) in buckets)
        {
            var category = categoryId is null ? null : categories.FirstOrDefault(c => c.Id == categoryId.Value);
            if (categoryId is not null && category is null) continue;
            var groupMap = new Dictionary<string, ColumnGroupDto>(StringComparer.Ordinal);
            foreach (var c in bucket)
            {
                var gkey = LogicalGroupKey(c.StandardField, c.Id);
                if (!groupMap.TryGetValue(gkey, out var group))
                {
                    group = new ColumnGroupDto(
                        gkey,
                        c.StandardField is null ? c.HeaderRaw : StandardFieldLabel(c.StandardField.Value)!,
                        c.StandardField?.ToString(), new List<BoardColumnDto>());
                    groupMap[gkey] = group;
                }
                ((List<BoardColumnDto>)group.Columns).Add(new BoardColumnDto(
                    c.Id, c.HeaderRaw, c.ColumnIndex, c.FileId, c.File.Name, c.File.Group.Name));
            }
            result.Add(new CategoryBoardDto(categoryId, category?.Name ?? "أخرى", groupMap.Values.ToList()));
        }
        // Categories without columns still render their (empty) board section.
        foreach (var category in categories.Where(c => result.All(r => r.CategoryId != c.Id)))
            result.Add(new CategoryBoardDto(category.Id, category.Name, []));
        // أخرى first only when it exists; otherwise keep category order.
        return result
            .OrderBy(r => r.CategoryId is null ? -1 : categories.ToList().FindIndex(c => c.Id == r.CategoryId))
            .ToList();
    }

    public async Task<CategoryDto> CreateAsync(CreateCategoryRequest request, string actorUsername, CancellationToken ct = default)
    {
        var name = ValidateName(request.Name);
        Category? created = null;
        await uow.ExecuteInTransactionAsync(async () =>
        {
            if (await uow.Categories.CountAsync(ct: ct) >= MaxCustomCategories)
                throw new InvalidOperationException(LimitMessage);
            if (await uow.Categories.NameExistsAsync(name, ct: ct))
                throw new InvalidOperationException("توجد فئة بهذا الاسم بالفعل.");
            var last = await uow.Categories.MaxSortOrderAsync(ct) ?? -1;
            created = new Category { Name = name, SortOrder = last + 1 };
            uow.Categories.Add(created);
            await uow.SaveChangesAsync(ct);
            await activity.WriteAsync(ActivityAction.CategoryCreated, name, new { by = actorUsername }, ct);
        }, ct);
        return ToDto(created!);
    }

    public async Task<CategoryDto> UpdateAsync(Guid id, UpdateCategoryRequest request, string actorUsername, CancellationToken ct = default)
    {
        var name = ValidateName(request.Name);
        var category = await uow.Categories.FindAsync(id, ct)
            ?? throw new KeyNotFoundException("الفئة غير موجودة.");
        if (await uow.Categories.NameExistsAsync(name, id, ct))
            throw new InvalidOperationException("توجد فئة بهذا الاسم بالفعل.");
        category.Name = name;
        await uow.Categories.SaveAsync(ct);
        await activity.WriteAsync(ActivityAction.CategoryUpdated, name, new { by = actorUsername }, ct);
        return ToDto(category);
    }

    public async Task ReorderAsync(Guid id, string direction, string actorUsername, CancellationToken ct = default)
    {
        if (direction != "up" && direction != "down")
            throw new InvalidDataException("اتجاه الترتيب غير صالح.");
        var categories = (await uow.Categories.ListOrderedAsync(ct)).ToList();
        var index = categories.FindIndex(x => x.Id == id);
        if (index < 0) throw new KeyNotFoundException("الفئة غير موجودة.");
        var swapIndex = direction == "up" ? index - 1 : index + 1;
        if (swapIndex < 0 || swapIndex >= categories.Count)
            throw new InvalidOperationException("لا يمكن نقل الفئة في هذا الاتجاه.");
        (categories[index].SortOrder, categories[swapIndex].SortOrder) = (categories[swapIndex].SortOrder, categories[index].SortOrder);
        await uow.SaveChangesAsync(ct);
        await activity.WriteAsync(ActivityAction.CategoryReordered, categories[index].Name, new { direction, by = actorUsername }, ct);
    }

    public async Task DeleteAsync(Guid id, string confirmName, string actorUsername, CancellationToken ct = default)
    {
        var category = await uow.Categories.FindAsync(id, ct)
            ?? throw new KeyNotFoundException("الفئة غير موجودة.");
        if (confirmName != category.Name) throw new InvalidOperationException("اسم التأكيد لا يطابق اسم الفئة.");
        // V1 deleteCategory: columns return to أخرى with reassigned sort
        // orders (standard grouping preserved), then the category is gone.
        await uow.ExecuteInTransactionAsync(async () =>
        {
            var list = await uow.FileColumns.ListByCategoryAsync(id, ct);
            var weights = await columns.AssignAsync(
                list.Select(c => (null as Guid?, c.StandardField)).ToList(), ct);
            for (var i = 0; i < list.Count; i++)
            {
                list[i].CategoryId = null;
                list[i].SortOrder = weights[i];
            }
            uow.Categories.Remove(category);
            await uow.SaveChangesAsync(ct);
            await activity.WriteAsync(ActivityAction.CategoryDeleted, category.Name,
                new { columns = list.Count, by = actorUsername }, ct);
        }, ct);
    }

    public async Task<string> MoveColumnAsync(Guid columnId, Guid? categoryId, string actorUsername, CancellationToken ct = default)
    {
        if (columnId == Guid.Empty) throw new InvalidDataException("معرف العمود غير صالح.");
        var column = await uow.FileColumns.FindWithGraphAsync(columnId, ct)
            ?? throw new KeyNotFoundException("العمود غير موجود.");
        string? targetName = null;
        if (categoryId is not null)
        {
            var target = await uow.Categories.FindAsync(categoryId.Value, ct)
                ?? throw new InvalidOperationException("الفئة المستهدفة لم تعد موجودة.");
            targetName = target.Name;
        }
        if (column.CategoryId == categoryId)
            return "العمود موجود ضمن هذه الفئة بالفعل.";
        var from = column.Category?.Name ?? "أخرى";
        await uow.ExecuteInTransactionAsync(async () =>
        {
            var weights = await columns.AssignAsync([(categoryId, column.StandardField)], ct);
            column.CategoryId = categoryId;
            column.SortOrder = weights[0];
            await uow.SaveChangesAsync(ct);
            await activity.WriteAsync(ActivityAction.ColumnRecategorized,
                $"{column.HeaderRaw} — {column.File.Name}",
                new { columnId = column.Id, from, to = targetName ?? "أخرى", by = actorUsername }, ct);
        }, ct);
        return column.StandardField is null
            ? $"تم نقل العمود إلى «{targetName ?? "أخرى"}» ووضعه في نهاية القائمة."
            : $"تم نقل العمود إلى «{targetName ?? "أخرى"}» ودمجه مع ترتيب الحقل القياسي المرتبط به.";
    }

    public async Task ReorderColumnGroupsAsync(Guid? categoryId, IReadOnlyList<string> orderedGroupKeys, string actorUsername, CancellationToken ct = default)
    {
        if (orderedGroupKeys is null || orderedGroupKeys.Count > 5000
            || orderedGroupKeys.Any(k => string.IsNullOrEmpty(k) || k.Length > 100))
            throw new InvalidDataException("بيانات الترتيب غير صالحة.");
        string? categoryName = null;
        if (categoryId is not null)
        {
            categoryName = (await uow.Categories.FindAsync(categoryId.Value, ct))?.Name
                ?? throw new KeyNotFoundException("الفئة لم تعد موجودة.");
        }
        var keyRows = await uow.FileColumns.ListKeysByCategoryAsync(categoryId, ct);
        var columns = keyRows.Select(x => new { Id = x.Id, StandardField = x.Standard }).ToList();
        var groups = new Dictionary<string, List<Guid>>(StringComparer.Ordinal);
        foreach (var column in columns)
        {
            var key = LogicalGroupKey(column.StandardField, column.Id);
            if (!groups.TryGetValue(key, out var list)) groups[key] = list = [];
            list.Add(column.Id);
        }
        var unique = new HashSet<string>(orderedGroupKeys, StringComparer.Ordinal);
        if (unique.Count != orderedGroupKeys.Count || unique.Count != groups.Count
            || orderedGroupKeys.Any(k => !groups.ContainsKey(k)))
            throw new InvalidOperationException("تغيّرت أعمدة الفئة. حدّث الصفحة ثم أعد المحاولة.");
        try
        {
            await uow.ExecuteInTransactionAsync(async () =>
            {
            for (var order = 0; order < orderedGroupKeys.Count; order++)
            {
                var ids = groups[orderedGroupKeys[order]];
                // Load-then-save (not ExecuteUpdate) so the InMemory test
                // provider and relational databases share one code path.
                var rows = await uow.FileColumns.ListAsync(c => ids.Contains(c.Id) && c.CategoryId == categoryId, ct);
                foreach (var row in rows) row.SortOrder = order;
                await uow.SaveChangesAsync(ct);
            }
                await activity.WriteAsync(ActivityAction.ColumnReordered, categoryName ?? "أخرى",
                    new { categoryId, groups = orderedGroupKeys.Count, by = actorUsername }, ct);
            }, ct);
        }
        catch (Exception ex) when (ex is not (InvalidOperationException or KeyNotFoundException or InvalidDataException))
        {
            throw new InvalidOperationException("تعذر حفظ ترتيب الأعمدة. حاول مرة أخرى.");
        }
    }

    private static string ValidateName(string? name)
    {
        var trimmed = (name ?? "").Trim();
        if (trimmed.Length < 2) throw new InvalidDataException("اسم الفئة قصير جدًا.");
        if (trimmed.Length > 100) throw new InvalidDataException("اسم الفئة طويل جدًا.");
        return trimmed;
    }

    private static string LogicalGroupKey(StandardField? standardField, Guid columnId) =>
        standardField is null ? $"column:{columnId:D}" : $"standard:{ToSnake(standardField.Value)}";

    private static string ToSnake(StandardField value)
    {
        var name = value.ToString();
        return string.Concat(name.Select((c, i) =>
            i > 0 && char.IsUpper(c) ? "_" + char.ToLowerInvariant(c) : char.ToLowerInvariant(c).ToString()));
    }

    private static string? StandardFieldLabel(StandardField value) => value switch
    {
        StandardField.FirstName => "الاسم",
        StandardField.FatherName => "اسم الأب",
        StandardField.LastName => "النسبة",
        StandardField.FullName => "الاسم الثلاثي",
        StandardField.NationalId => "الرقم الوطني",
        StandardField.ShamCash => "الشام كاش",
        StandardField.PersonalNo => "الرقم الذاتي",
        StandardField.MotherName => "اسم الأم",
        StandardField.Phone => "رقم الهاتف",
        StandardField.ContractCode => "رمز العقد الأساسي",
        StandardField.SecondaryContractCode => "رمز العقد الثانوي",
        StandardField.JobTitle => "المسمى الوظيفي",
        StandardField.FunctionalCategory => "الفئة الوظيفية",
        StandardField.OrganizationalLevel => "السوية التنظيمية الأساسية",
        _ => null,
    };

    private static CategoryDto ToDto(Category x) => new(x.Id, x.Name, x.SortOrder, x.CreatedAt);
}
