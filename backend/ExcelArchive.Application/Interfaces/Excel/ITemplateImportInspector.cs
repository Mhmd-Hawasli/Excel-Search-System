using ExcelArchive.Application.DTOs.ExportTemplateDto;

namespace ExcelArchive.Application.Interfaces.Excel;

/// <summary>يقرأ عناوين الصف الأول لكل ورقة من ملف استيراد قالب
/// (خفيف: بلا حفظ أو معالجة بيانات).</summary>
public interface ITemplateImportInspector
{
    Task<IReadOnlyList<ImportSheetHeadersDto>> InspectAsync(Stream stream, string fileName, CancellationToken ct = default);
}
