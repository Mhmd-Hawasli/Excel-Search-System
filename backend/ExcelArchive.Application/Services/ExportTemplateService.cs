using System.Text.Json;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.ExcelDto;
using ExcelArchive.Application.DTOs.ExportTemplateDto;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Domain.Entities;

namespace ExcelArchive.Application.Services;

/// <summary>قوالب التصدير المخصص: حفظ ترتيب أعمدة وأسماء لملف مصدر واحد
/// ثم التصدير السريع حسب القالب، مع فرض نطاق بيانات المستخدم.</summary>
public class ExportTemplateService(
    IUnitOfWork uow,
    IFileService files,
    IFileExportBuilder exports) : IExportTemplateService
{
    public const int MaxColumns = 100;
    public const int MaxReplacementsPerColumn = 100;

    public async Task<IReadOnlyList<ExportTemplateDto>> ListAsync(DataScopeDto scope, Guid? fileId, CancellationToken ct = default)
    {
        IReadOnlyList<ExportTemplate> rows;
        if (fileId.HasValue)
        {
            if (scope.FileIds is not null && !scope.FileIds.Contains(fileId.Value))
                return [];
            rows = await uow.ExportTemplates.ListByFileAsync(fileId.Value, ct);
        }
        else if (scope.FileIds is not null)
        {
            rows = scope.FileIds.Count == 0
                ? []
                : await uow.ExportTemplates.ListByFileIdsAsync(scope.FileIds, ct);
        }
        else
        {
            rows = await uow.ExportTemplates.ListAsync(ct);
        }
        return rows.Select(row => ToDto(row)).ToList();
    }

    public async Task<ExportTemplateDto?> GetAsync(Guid id, DataScopeDto scope, CancellationToken ct = default)
    {
        var row = await uow.ExportTemplates.FindAsync(id, ct);
        if (row is null) return null;
        if (scope.FileIds is not null && !scope.FileIds.Contains(row.FileId)) return null;
        var file = await uow.Files.FindWithGroupAsync(row.FileId, ct);
        return ToDto(row, file?.Name, file?.Group?.Name);
    }

    public async Task<ExportTemplateDto> CreateAsync(CreateExportTemplateRequest request, DataScopeDto scope, string actorUsername, CancellationToken ct = default)
    {
        if (request is null) throw new InvalidDataException("بيانات القالب غير صالحة.");
        var name = request.Name?.Trim() ?? "";
        if (name.Length < 2 || name.Length > 120)
            throw new InvalidDataException("أدخل اسمًا واضحًا للقالب (بين حرفين و120 حرفًا).");
        var file = await uow.Files.FindWithColumnsAsync(request.FileId, ct)
            ?? throw new KeyNotFoundException("الملف المصدر غير موجود.");
        if (scope.FileIds is not null && !scope.FileIds.Contains(request.FileId))
            throw new KeyNotFoundException("الملف المصدر غير موجود.");
        var columns = NormalizeColumns(request.Columns, file.Columns.Select(c => c.HeaderRaw).ToList());
        if (await uow.ExportTemplates.ExistsAsync(request.FileId, name, ct))
            throw new InvalidOperationException("يوجد قالب بهذا الاسم لهذا الملف. اختر اسمًا آخر.");
        var row = new ExportTemplate
        {
            FileId = request.FileId, Name = name,
            Columns = ExportTemplateColumnCodec.Encode(columns),
            CreatedBy = actorUsername,
        };
        uow.ExportTemplates.Add(row);
        await uow.SaveChangesAsync(ct);
        return ToDto(row, file.Name, file.Group?.Name);
    }

    public async Task<ExportTemplateDto> UpdateAsync(Guid id, UpdateExportTemplateRequest request, DataScopeDto scope, string actorUsername, CancellationToken ct = default)
    {
        if (request is null) throw new InvalidDataException("بيانات القالب غير صالحة.");
        var row = await uow.ExportTemplates.FindAsync(id, ct)
            ?? throw new KeyNotFoundException("القالب غير موجود.");
        if (scope.FileIds is not null && !scope.FileIds.Contains(row.FileId))
            throw new KeyNotFoundException("القالب غير موجود.");
        var file = await uow.Files.FindWithColumnsAsync(row.FileId, ct)
            ?? throw new KeyNotFoundException("الملف المصدر غير موجود.");
        var name = request.Name?.Trim() ?? "";
        if (name.Length < 2 || name.Length > 120)
            throw new InvalidDataException("أدخل اسمًا واضحًا للقالب (بين حرفين و120 حرفًا).");
        var columns = NormalizeColumns(request.Columns, file.Columns.Select(c => c.HeaderRaw).ToList());
        if (await uow.ExportTemplates.ExistsOtherAsync(id, row.FileId, name, ct))
            throw new InvalidOperationException("يوجد قالب بهذا الاسم لهذا الملف. اختر اسمًا آخر.");
        row.Name = name;
        row.Columns = ExportTemplateColumnCodec.Encode(columns);
        row.UpdatedAt = DateTime.UtcNow;
        await uow.SaveChangesAsync(ct);
        _ = actorUsername;
        return ToDto(row, file.Name, file.Group?.Name);
    }

    public async Task DeleteAsync(Guid id, DataScopeDto scope, CancellationToken ct = default)
    {
        var row = await uow.ExportTemplates.FindAsync(id, ct)
            ?? throw new KeyNotFoundException("القالب غير موجود.");
        if (scope.FileIds is not null && !scope.FileIds.Contains(row.FileId))
            throw new KeyNotFoundException("القالب غير موجود.");
        uow.ExportTemplates.Remove(row);
        await uow.SaveChangesAsync(ct);
    }

    public async Task<(byte[] Bytes, string Filename)> BuildCustomExportAsync(
        Guid fileId, IReadOnlyList<ExportTemplateColumnDto> columns, bool markEdits, DataScopeDto scope, CancellationToken ct = default)
    {
        if (scope.FileIds is not null && !scope.FileIds.Contains(fileId))
            throw new KeyNotFoundException("الملف المصدر غير موجود.");
        var data = await files.GetExportDataAsync(fileId, ct)
            ?? throw new KeyNotFoundException("الملف المصدر غير موجود.");
        var normalized = NormalizeColumns(columns, data.Headers);
        // الأعمدة الإضافية (مصدر فارغ) لا تملك قيمًا أصلية: تُستبعد من
        // خرائط المصدر المستخدمة للتعديلات والرقم الوطني.
        var realCols = normalized.Where(c => c.Source is not null).ToList();
        var bySource = realCols.ToDictionary(c => c.Source!, c => DisplayName(c), StringComparer.Ordinal);
        var exportHeaders = normalized.Select(c => DisplayName(c)).ToList();
        var replacementMaps = realCols.ToDictionary(
            c => c.Source!,
            c => (c.Replacements ?? []).ToDictionary(r => r.From, r => r.To, StringComparer.Ordinal));

        var records = data.Records.Select(r =>
        {
            var mapped = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var col in normalized)
            {
                string value;
                if (col.Source is null)
                {
                    // عمود إضافي فارغ القيم.
                    value = "";
                }
                else
                {
                    value = r.Data.TryGetValue(col.Source, out var v) ? v : "";
                    if (replacementMaps[col.Source].TryGetValue(value, out var replaced))
                        value = replaced;
                }
                mapped[DisplayName(col)] = value;
            }
            Dictionary<string, string>? fills = null;
            if (r.Fills is not null)
            {
                fills = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (var col in realCols)
                    if (r.Fills.TryGetValue(col.Source!, out var v))
                        fills[DisplayName(col)] = v;
                if (fills.Count == 0) fills = null;
            }
            Dictionary<string, string>? fonts = null;
            if (r.Fonts is not null)
            {
                fonts = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (var col in realCols)
                    if (r.Fonts.TryGetValue(col.Source!, out var v))
                        fonts[DisplayName(col)] = v;
                if (fonts.Count == 0) fonts = null;
            }
            return new ExportRecordDto(r.Id, r.RowIndex, mapped, fills, fonts, r.DisplayName, r.NationalId);
        }).ToList();

        var edits = data.Edits
            .Where(e => bySource.ContainsKey(e.HeaderRaw))
            .Select(e => e with { HeaderRaw = bySource[e.HeaderRaw] })
            .ToList();

        string? nationalHeader = null;
        if (data.NationalIdHeader is not null && bySource.TryGetValue(data.NationalIdHeader, out var mappedNational))
            nationalHeader = mappedNational;

        var bytes = exports.Build(data.SheetName, exportHeaders, records, edits, markEdits, nationalHeader);
        var safeFile = string.IsNullOrWhiteSpace(data.FileName) ? "تصدير-مخصص" : data.FileName.Trim();
        var filename = $"{safeFile}-مخصص-{DateTime.UtcNow:yyyy-MM-dd}.xlsx";
        return (bytes, filename);
    }

    public async Task<IReadOnlyList<ExportSourceFileDto>> ListSourceFilesAsync(DataScopeDto scope, CancellationToken ct = default)
    {
        var files = await uow.Files.ListScopedAsync(scope.FileIds, ct);
        if (files.Count == 0) return [];
        var groupIds = files.Select(f => f.GroupId).Distinct().ToList();
        var groups = await uow.Groups.ListAsync(g => groupIds.Contains(g.Id), ct);
        var byId = groups.ToDictionary(g => g.Id);
        return files
            .OrderBy(f => byId.TryGetValue(f.GroupId, out var g) ? g.SortOrder : int.MaxValue)
            .ThenByDescending(f => f.UploadedAt)
            .Select(f => new ExportSourceFileDto(f.Id, f.Name, f.GroupId,
                byId.TryGetValue(f.GroupId, out var g) ? g.Name : "", f.RowCount))
            .ToList();
    }

    public async Task<ExportSourceColumnsDto?> GetSourceColumnsAsync(Guid fileId, DataScopeDto scope, CancellationToken ct = default)
    {
        if (scope.FileIds is not null && !scope.FileIds.Contains(fileId)) return null;
        var file = await uow.Files.FindWithColumnsAsync(fileId, ct);
        if (file is null) return null;
        return new ExportSourceColumnsDto(file.Id, file.Name, file.Group?.Name,
            file.Columns.OrderBy(c => c.ColumnIndex)
                .Select(c => new ExportSourceColumnDto(c.HeaderRaw, c.ColumnIndex)).ToList());
    }

    /// <summary>تطبيع تشكيلة الأعمدة والتحقق منها: غير فارغة، مصادر موجودة
    /// في الملف، بلا تكرار، وأسماء عرض فريدة (غير حساسة لحالة الأحرف).</summary>
    internal static List<ExportTemplateColumnDto> NormalizeColumns(
        IReadOnlyList<ExportTemplateColumnDto>? columns, IReadOnlyList<string> availableHeaders)
    {
        if (columns is null || columns.Count == 0)
            throw new InvalidDataException("حدد عمودًا واحدًا على الأقل للتصدير.");
        if (columns.Count > MaxColumns)
            throw new InvalidDataException($"عدد الأعمدة يتجاوز الحد المسموح ({MaxColumns}).");
        var available = new HashSet<string>(availableHeaders, StringComparer.Ordinal);
        var seenSource = new HashSet<string>(StringComparer.Ordinal);
        var seenDisplay = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<ExportTemplateColumnDto>(columns.Count);
        foreach (var col in columns)
        {
            if (col is null) throw new InvalidDataException("بيانات الأعمدة غير صالحة.");
            var source = col.Source?.Trim() ?? "";
            var alias = col.Alias?.Trim();
            if (alias?.Length > 500)
                throw new InvalidDataException("اسم العمود المخصص طويل جدًا.");
            if (source.Length == 0)
            {
                // عمود إضافي باسم مخصص لا وجود له في الملف المصدر:
                // يُصدَّر فارغ القيم (لمطابقة صيغة ملف آخر فيه أعمدة زائدة).
                if (string.IsNullOrEmpty(alias))
                    throw new InvalidDataException("اسم العمود الإضافي مطلوب.");
                if (!seenDisplay.Add(alias))
                    throw new InvalidDataException($"اسم العمود «{alias}» مكرر في التصدير. غيّر الأسماء المخصصة.");
                result.Add(new ExportTemplateColumnDto(null, alias, []));
                continue;
            }
            if (source.Length > 500)
                throw new InvalidDataException("بيانات الأعمدة غير صالحة.");
            if (!available.Contains(source))
                throw new InvalidDataException($"العمود «{source}» غير موجود في الملف المصدر.");
            if (!seenSource.Add(source))
                throw new InvalidDataException($"العمود «{source}» مكرر في التشكيلة.");
            var display = string.IsNullOrEmpty(alias) ? source : alias;
            if (!seenDisplay.Add(display))
                throw new InvalidDataException($"اسم العمود «{display}» مكرر في التصدير. غيّر الأسماء المخصصة.");
            var replacements = NormalizeReplacements(col.Replacements, source);
            result.Add(new ExportTemplateColumnDto(source, string.IsNullOrEmpty(alias) ? null : alias, replacements));
        }
        return result;
    }

    private static List<ValueReplacementDto> NormalizeReplacements(
        IReadOnlyList<ValueReplacementDto>? replacements, string source)
    {
        var result = new List<ValueReplacementDto>();
        if (replacements is null || replacements.Count == 0) return result;
        if (replacements.Count > MaxReplacementsPerColumn)
            throw new InvalidDataException($"عدد الاستبدالات للعمود «{source}» يتجاوز الحد المسموح ({MaxReplacementsPerColumn}).");
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var rep in replacements)
        {
            if (rep is null) throw new InvalidDataException("بيانات الاستبدال غير صالحة.");
            var from = rep.From?.Trim() ?? "";
            var to = (rep.To ?? "").Trim();
            if (from.Length == 0 || from.Length > 500)
                throw new InvalidDataException($"قيمة الاستبدال للعمود «{source}» غير صالحة.");
            if (to.Length > 500)
                throw new InvalidDataException($"القيمة البديلة للعمود «{source}» طويلة جدًا.");
            if (!seen.Add(from))
                throw new InvalidDataException($"القيمة «{from}» مكررة في استبدالات العمود «{source}».");
            result.Add(new ValueReplacementDto(from, to));
        }
        return result;
    }

    private static string DisplayName(ExportTemplateColumnDto c)
        => string.IsNullOrWhiteSpace(c.Alias) ? (c.Source ?? "") : c.Alias.Trim();

    private static ExportTemplateDto ToDto(ExportTemplate row, string? fileName = null, string? groupName = null)
        => new(row.Id, row.FileId, fileName ?? row.File?.Name ?? "",
            groupName ?? row.File?.Group?.Name,
            row.Name, ExportTemplateColumnCodec.Decode(row.Columns),
            row.CreatedBy, row.CreatedAt, row.UpdatedAt);
}
