using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.ExportTemplateDto;

namespace ExcelArchive.Application.Interfaces.Services;

public interface IExportTemplateService
{
    Task<IReadOnlyList<ExportTemplateDto>> ListAsync(DataScopeDto scope, Guid? fileId, CancellationToken ct = default);
    Task<ExportTemplateDto?> GetAsync(Guid id, DataScopeDto scope, CancellationToken ct = default);
    Task<ExportTemplateDto> CreateAsync(CreateExportTemplateRequest request, DataScopeDto scope, string actorUsername, CancellationToken ct = default);
    Task<ExportTemplateDto> UpdateAsync(Guid id, UpdateExportTemplateRequest request, DataScopeDto scope, string actorUsername, CancellationToken ct = default);
    Task DeleteAsync(Guid id, DataScopeDto scope, CancellationToken ct = default);
    /// <summary>يبني ملف XLSX حسب ترتيب الأعمدة المعطى (قالب محفوظ أو تشكيلة لحظية).</summary>
    Task<(byte[] Bytes, string Filename)> BuildCustomExportAsync(Guid fileId, IReadOnlyList<ExportTemplateColumnDto> columns, bool markEdits, DataScopeDto scope, CancellationToken ct = default);
    Task<IReadOnlyList<ExportSourceFileDto>> ListSourceFilesAsync(DataScopeDto scope, CancellationToken ct = default);
    Task<ExportSourceColumnsDto?> GetSourceColumnsAsync(Guid fileId, DataScopeDto scope, CancellationToken ct = default);
}
