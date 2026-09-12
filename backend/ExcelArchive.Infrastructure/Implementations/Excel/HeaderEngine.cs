using ClosedXML.Excel;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Text;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>Header cleanup, signatures, suggestions and mapping guards.
/// Ports V1 workbook.ts (headers/columnSignature), standard-field-catalog.ts,
/// mapping.ts and config.ts linkedMappingError.</summary>
public static class HeaderEngine
{
    private static readonly Dictionary<string, string[]> Aliases = new()
    {
        ["first_name"] = ["الاسم", "اسم"],
        ["father_name"] = ["اسم الاب", "الاب", "اسم الوالد"],
        ["last_name"] = ["النسبه", "الكنيه", "اللقب"],
        ["full_name"] = ["الاسم الثلاثي", "الاسم الكامل", "اسم الشخص"],
        ["national_id"] = ["الرقم الوطني", "رقم وطني", "الرقم الوطنى", "الرقم القومي"],
        ["sham_cash"] = ["الشام كاش", "شام كاش", "رقم شام كاش"],
        ["personal_no"] = ["الرقم الذاتي", "رقم ذاتي", "الرقم الوظيفي"],
        ["mother_name"] = ["اسم الام", "الام", "اسم الوالده"],
        ["phone"] = ["رقم الهاتف", "الهاتف", "الموبايل", "الجوال", "رقم الموبايل"],
        ["contract_code"] = ["رمز العقد الأساسي", "كود العقد الأساسي", "رقم العقد الأساسي", "رمز العقد", "كود العقد", "رقم العقد"],
        ["secondary_contract_code"] = ["رمز العقد الثانوي", "كود العقد الثانوي", "رقم العقد الثانوي", "الرمز الثانوي للعقد", "رمز العقد الإضافي", "رمز العقد الاضافي", "كود العقد الإضافي"],
        ["job_title"] = ["المسمى الوظيفي", "مسمى وظيفي", "المسمى", "مسمى الوظيفة", "المسمى الوظيفي الحالي", "الوظيفة الحالية", "الوظيفة", "الوظيفه"],
        ["functional_category"] = ["الفئة الوظيفية", "فئة وظيفية", "الفئة", "فئة", "الدرجة الوظيفية", "درجة وظيفية"],
        ["organizational_level"] = ["السوية التنظيمية الأساسية", "السوية التنظيمية", "السوية", "المستوى التنظيمي الأساسي", "المستوى التنظيمي", "السوية التنظيميه", "المستوي التنظيمي"],
    };

    /// <summary>Headers for a sheet: table-aware bounds, blank → "عمود N",
    /// duplicates (normalized) throw like V1.</summary>
    public static List<string> HeadersForSheet(IXLWorksheet ws, SheetTableRange? table)
    {
        var headerRow = table?.HeaderRow ?? 1;
        var firstCol = table?.FirstCol ?? 1;
        var row = ws.Row(headerRow);
        var count = table?.ColumnCount ?? Math.Max(ws.LastColumnUsed()?.ColumnNumber() ?? 0, 1);
        var headers = new List<string>(count);
        for (var i = 0; i < count; i++)
        {
            var text = ExcelCellReader.CellText(row.Cell(firstCol + i)).Trim();
            headers.Add(string.IsNullOrEmpty(text) ? $"عمود {i + 1}" : text);
        }
        var normalized = headers.Select(ArabicNormalizer.NormalizeStored).ToList();
        if (normalized.Where(h => h.Length > 0).GroupBy(h => h).Any(g => g.Count() > 1))
            throw new InvalidDataException("تحتوي الورقة على أسماء أعمدة مكررة. يرجى جعل عناوين الصف الأول فريدة ثم رفع الملف من جديد.");
        return headers;
    }

    /// <summary>SHA-256 hex over unit-separator-joined normalized headers (V1 exact).</summary>
    public static string ColumnSignature(IEnumerable<string> headers)
    {
        // Unit separator (U+001F), built from its code point so no literal
        // control character ever lands in source.
        var joined = string.Join(((char)0x1F).ToString(), headers.Select(h => ArabicNormalizer.NormalizeStored(h)));
        return Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(joined))).ToLowerInvariant();
    }

    private static HashSet<string> Bigrams(string value)
    {
        if (value.Length < 2) return [value];
        var set = new HashSet<string>();
        for (var i = 0; i < value.Length - 1; i++) set.Add(value.Substring(i, 2));
        return set;
    }

    private static double Dice(string left, string right)
    {
        if (left == right) return 1;
        var a = Bigrams(left);
        var b = Bigrams(right);
        var overlap = a.Count(b.Contains);
        return 2.0 * overlap / (a.Count + b.Count == 0 ? 1 : a.Count + b.Count);
    }

    /// <summary>
    /// Suggests the standard field for a header, smartest-match first:
    /// exact = 1.0, alias-tokens-subset = 0.90 + 0.09 × alias/header token
    /// coverage (so "اسم الام" outranks a lone "اسم" inside "اسم الام الكامل"),
    /// substring scaled by coverage (0.9 × alias/header length, so a short
    /// alias inside a long unrelated header falls below threshold),
    /// bigram-Dice fallback ≥ 0.66.
    /// Separators (_, -, /, …) are unified to spaces before matching so
    /// headers like "الاسم_الثلاثي" hit their exact alias. Ties keep catalog
    /// order — stable, same as V1.
    /// </summary>
    public static string? SuggestStandardField(string header)
    {
        var normalized = ArabicNormalizer.NormalizeStored(UnifySeparators(header));
        if (normalized.Length == 0) return null;
        string? best = null;
        var bestScore = 0.0;
        foreach (var key in StandardFieldKeys.All)
        {
            foreach (var alias in Aliases[key])
            {
                var candidate = ArabicNormalizer.NormalizeStored(UnifySeparators(alias));
                if (candidate.Length == 0) continue;
                double score;
                if (normalized == candidate) score = 1;
                else if (TokenCoverage(candidate, normalized) is double coverage) score = 0.90 + 0.09 * coverage;
                else if (normalized.Contains(candidate, StringComparison.Ordinal)
                    || candidate.Contains(normalized, StringComparison.Ordinal))
                    score = 0.9 * Math.Min(1.0, (double)candidate.Length / normalized.Length);
                else
                {
                    var dice = Dice(normalized, candidate);
                    if (dice < 0.66) continue;
                    score = dice;
                }
                if (score > bestScore) { bestScore = score; best = key; }
            }
        }
        return bestScore >= 0.58 ? best : null;
    }

    /// <summary>Excel-style separators carry no meaning: unify to spaces.</summary>
    private static string UnifySeparators(string value)
        => Separators.Replace(value, " ");

    private static readonly System.Text.RegularExpressions.Regex Separators =
        new(@"[_/\|:;.,،\-–—()\[\]{}""'«»!?…]+", System.Text.RegularExpressions.RegexOptions.Compiled);

    private static bool TokensEqual(string left, string right)
        => left == right
            || ArabicNormalizer.StripDefiniteArticle(left) == ArabicNormalizer.StripDefiniteArticle(right);

    /// <summary>
    /// Alias-token coverage of the header (0..1) when every alias token has
    /// a header token (exact hit weighs 1, ال-stripped hit weighs 0.5);
    /// otherwise null.
    /// </summary>
    private static double? TokenCoverage(string candidate, string normalized)
    {
        var aliasTokens = candidate.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (aliasTokens.Length == 0) return null;
        var headerTokens = normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (headerTokens.Length == 0) return null;
        var weight = 0.0;
        foreach (var token in aliasTokens)
        {
            if (headerTokens.Any(h => h == token)) weight += 1;
            else if (headerTokens.Any(h => TokensEqual(token, h))) weight += 0.5;
            else return null;
        }
        return weight / headerTokens.Length;
    }

    /// <summary>Enforces one-standard-per-column + locked national key (mapping.ts).</summary>
    public static List<InspectedColumn> EnsureUniqueStandardFields(
        List<InspectedColumn> columns, int? nationalIdColumnIndex = null)
    {
        var used = new HashSet<string>();
        return columns.Select(input =>
        {
            var field = input.SuggestedField;
            if (nationalIdColumnIndex.HasValue)
            {
                field = input.ColumnIndex == nationalIdColumnIndex.Value ? "national_id"
                    : field == "national_id" ? null : field;
            }
            if (field is null) return input with { SuggestedField = null };
            if (!used.Add(field)) return input with { SuggestedField = null };
            return input with { SuggestedField = field };
        }).ToList();
    }

    /// <summary>Linked-mode mapping guard (config.ts linkedMappingError).</summary>
    public static string? LinkedMappingError(
        string sheetName,
        int sheetIndex,
        IReadOnlyList<string>? supplementalNames,
        int nationalIdColumnIndex,
        IReadOnlyList<InspectedColumn> columns)
    {
        if (supplementalNames is null) return null;
        if (sheetIndex != 1 || supplementalNames.Contains(sheetName))
            return "الورقة الأولى هي الأساسية؛ اختر أوراقاً إضافية مختلفة عنها.";
        var key = columns.FirstOrDefault(c => c.ColumnIndex == nationalIdColumnIndex);
        return key?.SuggestedField != "national_id"
            ? "يجب إبقاء حقل الرقم الوطني مربوطاً بعمود مفتاح الربط في الورقة الأساسية."
            : null;
    }
}
