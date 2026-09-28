namespace ExcelArchive.Application.DTOs.ExportTemplateDto;

/// <summary>عناوين الصف الأول لورقة واحدة من ملف الاستيراد.</summary>
public sealed record ImportSheetHeadersDto(
    string SheetName,
    int ColumnCount,
    IReadOnlyList<string> Headers);
