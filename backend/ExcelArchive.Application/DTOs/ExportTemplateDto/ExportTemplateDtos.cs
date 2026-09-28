using System.Text.Json;

namespace ExcelArchive.Application.DTOs.ExportTemplateDto;

/// <summary>عمود واحد داخل قالب تصدير مخصص: المصدر هو HeaderRaw الأصلي،
/// والاسم المعروض هو عنوان العمود في ملف التصدير (يساوي المصدر عند تركه فارغًا)،
/// مع استبدالات يدوية للقيم تُطبق عند التصدير (تطابق كامل للخلية).
/// المصدر الفارغ (null) يعني عمودًا إضافيًا باسم مخصص تُترك قيمه فارغة.</summary>
public sealed record ExportTemplateColumnDto(
    string? Source,
    string? Alias,
    IReadOnlyList<ValueReplacementDto>? Replacements);

/// <summary>استبدال يدوي واحد: كل خلية تطابق From كاملةً تُصدَّر بقيمة To.</summary>
public sealed record ValueReplacementDto(string From, string To);

public sealed record ExportTemplateDto(
    Guid Id,
    Guid FileId,
    string FileName,
    string? GroupName,
    string Name,
    IReadOnlyList<ExportTemplateColumnDto> Columns,
    string? CreatedBy,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record CreateExportTemplateRequest(
    Guid FileId,
    string? Name,
    IReadOnlyList<ExportTemplateColumnDto>? Columns);

public sealed record UpdateExportTemplateRequest(
    string? Name,
    IReadOnlyList<ExportTemplateColumnDto>? Columns);

public sealed record CustomExportRequest(
    Guid FileId,
    IReadOnlyList<ExportTemplateColumnDto>? Columns,
    bool MarkEdits = false);

public sealed record ExportSourceFileDto(
    Guid FileId,
    string FileName,
    Guid GroupId,
    string GroupName,
    int RowCount);

public sealed record ExportSourceColumnDto(string HeaderRaw, int ColumnIndex);

public sealed record ExportSourceColumnsDto(
    Guid FileId,
    string FileName,
    string? GroupName,
    IReadOnlyList<ExportSourceColumnDto> Columns);

public static class ExportTemplateColumnCodec
{
    public static JsonDocument Encode(IReadOnlyList<ExportTemplateColumnDto> columns)
        => JsonSerializer.SerializeToDocument(columns.Select(c =>
            new
            {
                source = c.Source,
                alias = string.IsNullOrWhiteSpace(c.Alias) ? null : c.Alias.Trim(),
                replacements = (c.Replacements ?? []).Select(r => new { from = r.From, to = r.To }).ToList(),
            }).ToList());

    public static List<ExportTemplateColumnDto> Decode(JsonDocument? doc)
    {
        var result = new List<ExportTemplateColumnDto>();
        if (doc is null || doc.RootElement.ValueKind != JsonValueKind.Array) return result;
        foreach (var el in doc.RootElement.EnumerateArray())
        {
            if (el.ValueKind != JsonValueKind.Object) continue;
            string? source = el.TryGetProperty("source", out var s) && s.ValueKind == JsonValueKind.String
                ? s.GetString() ?? "" : null;
            string? alias = el.TryGetProperty("alias", out var a) && a.ValueKind == JsonValueKind.String
                ? a.GetString() : null;
            result.Add(new ExportTemplateColumnDto(source, alias, DecodeReplacements(el)));
        }
        return result;
    }

    private static List<ValueReplacementDto> DecodeReplacements(JsonElement el)
    {
        var result = new List<ValueReplacementDto>();
        // القوالب القديمة المحفوظة قبل ميزة الاستبدال لا تحمل المفتاح إطلاقًا.
        if (!el.TryGetProperty("replacements", out var arr) || arr.ValueKind != JsonValueKind.Array)
            return result;
        foreach (var item in arr.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            var from = item.TryGetProperty("from", out var f) && f.ValueKind == JsonValueKind.String
                ? f.GetString() ?? "" : "";
            var to = item.TryGetProperty("to", out var t) && t.ValueKind == JsonValueKind.String
                ? t.GetString() ?? "" : "";
            result.Add(new ValueReplacementDto(from, to));
        }
        return result;
    }
}
