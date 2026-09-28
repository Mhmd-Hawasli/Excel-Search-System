using System.Text.Json;

namespace ExcelArchive.Domain.Entities;

/// <summary>قالب تصدير مخصص: ترتيب أعمدة وأسماء مختارة لملف مصدر واحد،
/// يُحفظ لإعادة التصدير السريع لاحقًا.</summary>
public class ExportTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FileId { get; set; }
    /// <summary>اسم القالب (ترتيب أعمدة مخصص) — فريد ضمن الملف الواحد.</summary>
    public string Name { get; set; } = "";
    /// <summary>مصفوفة JSON مرتبة: [{source, alias}] حيث source هو HeaderRaw
    /// الأصلي و alias هو اسم العمود في ملف التصدير (اختياري).</summary>
    public JsonDocument Columns { get; set; } = null!;
    public string? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public File File { get; set; } = null!;
}
