using ExcelArchive.Application.DTOs.ExportTemplateDto;
using ExcelArchive.Application.Interfaces.Excel;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>فحص خفيف لملف استيراد القالب: أسماء الأوراق وعناوين صفها الأول
/// عبر كشف الترويسات نفسه المستخدم في الاستيراد (HeaderEngine).</summary>
public sealed class TemplateImportInspector : ITemplateImportInspector
{
    private const int MaxSheets = 50;
    private const int MaxHeadersPerSheet = 200;

    public Task<IReadOnlyList<ImportSheetHeadersDto>> InspectAsync(Stream stream, string fileName, CancellationToken ct = default)
    {
        var lower = (fileName ?? "").ToLowerInvariant();
        if (!lower.EndsWith(".xlsx") && !lower.EndsWith(".xls"))
            throw new InvalidDataException("الصيغ المقبولة هي XLSX وXLS فقط.");
        return Task.Run(() =>
        {
            using var ms = new MemoryStream();
            stream.CopyTo(ms);
            var bytes = ms.ToArray();
            if (bytes.Length == 0) throw new InvalidDataException("الملف فارغ.");
            if (bytes.Length > 10 * 1024 * 1024)
                throw new InvalidDataException("حجم ملف الاستيراد يتجاوز الحد المسموح وهو 10 ميغابايت.");
            ClosedXML.Excel.XLWorkbook workbook;
            try { workbook = SheetInspector.Load(bytes); }
            catch { throw new InvalidDataException("تعذر قراءة المصنف. إذا كان الملف بصيغة XLS القديمة فحوّله إلى XLSX ثم أعد المحاولة."); }
            using (workbook)
            {
                var sheets = workbook.Worksheets.Take(MaxSheets).ToList();
                if (sheets.Count == 0) throw new InvalidDataException("لا يحتوي المصنف على أي أوراق قابلة للقراءة.");
                var result = new List<ImportSheetHeadersDto>(sheets.Count);
                foreach (var ws in sheets)
                {
                    ct.ThrowIfCancellationRequested();
                    List<string> headers;
                    try { headers = HeaderEngine.HeadersForSheet(ws, null); }
                    catch { headers = []; }
                    headers = headers
                        .Select(h => (h ?? "").Trim())
                        .Where(h => h.Length > 0)
                        .Take(MaxHeadersPerSheet)
                        .ToList();
                    result.Add(new ImportSheetHeadersDto(ws.Name, headers.Count, headers));
                }
                return (IReadOnlyList<ImportSheetHeadersDto>)result;
            }
        }, ct);
    }
}
