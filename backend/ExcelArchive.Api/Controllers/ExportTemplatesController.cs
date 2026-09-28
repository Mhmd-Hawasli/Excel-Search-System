using ExcelArchive.Api.Common.Http;
using ExcelArchive.Application.Common;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.ExportTemplateDto;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

/// <summary>التصدير المخصص: اختيار ملف مصدر، تحديد أسماء الأعمدة وترتيبها،
/// حفظ التشكيلة كقالب، ثم التصدير السريع حسب القالب.</summary>
public class ExportTemplatesController(
    IExportTemplateService templates,
    IAuthService auth,
    ITemplateImportInspector importInspector) : ApiControllerBase(auth)
{
    private async Task<CurrentUserDto?> RequireExportViewAsync()
    {
        var user = CurrentUser ?? await Auth.GetSessionUserAsync(Request.Cookies[SessionCookie.Name]);
        if (user is not null) HttpContext.Items["CurrentUser"] = user;
        return user is not null
            && (Auth.HasPermission(user, Permissions.CustomExportView) || Auth.HasPermission(user, Permissions.CustomExportRun))
            ? user : null;
    }

    [HttpGet("export-templates")]
    public async Task<IActionResult> List([FromQuery] Guid? fileId)
    {
        var user = await RequireExportViewAsync();
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var scope = await Auth.ResolveDataScope(user);
        return Ok(ApiResponse.Success(new
        {
            templates = await templates.ListAsync(scope, fileId),
        }));
    }

    [HttpGet("export-templates/files")]
    public async Task<IActionResult> ListFiles()
    {
        var user = await RequireExportViewAsync();
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var scope = await Auth.ResolveDataScope(user);
        return Ok(ApiResponse.Success(new
        {
            files = await templates.ListSourceFilesAsync(scope),
        }));
    }

    [HttpGet("export-templates/files/{id:guid}/columns")]
    public async Task<IActionResult> GetColumns(Guid id)
    {
        var user = await RequireExportViewAsync();
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var scope = await Auth.ResolveDataScope(user);
        var result = await templates.GetSourceColumnsAsync(id, scope);
        return result is null ? HiddenNotFound() : Ok(ApiResponse.Success(result));
    }

    [HttpPost("export-templates")]
    public async Task<IActionResult> Create([FromBody] CreateExportTemplateRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.CustomExportRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (request is null) return Bad("بيانات القالب غير صالحة.");
        try
        {
            var scope = await Auth.ResolveDataScope(user);
            var created = await templates.CreateAsync(request, scope, user.Username);
            return StatusCode(StatusCodes.Status201Created, ApiResponse.Success(new { template = created }, "تم حفظ القالب."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPut("export-templates/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateExportTemplateRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.CustomExportRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (request is null) return Bad("بيانات القالب غير صالحة.");
        try
        {
            var scope = await Auth.ResolveDataScope(user);
            var updated = await templates.UpdateAsync(id, request, scope, user.Username);
            return Ok(ApiResponse.Success(new { template = updated }, "تم حفظ القالب."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpDelete("export-templates/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.CustomExportRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            var scope = await Auth.ResolveDataScope(user);
            await templates.DeleteAsync(id, scope);
            return Ok(ApiResponse.Success(null, "تم حذف القالب."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpGet("export-templates/{id:guid}/export")]
    public async Task<IActionResult> ExportByTemplate(Guid id, [FromQuery] bool markEdits = false)
    {
        var user = await RequirePermissionAsync(Permissions.CustomExportRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            var scope = await Auth.ResolveDataScope(user);
            var template = await templates.GetAsync(id, scope);
            if (template is null) return HiddenNotFound();
            var (bytes, filename) = await templates.BuildCustomExportAsync(
                template.FileId, template.Columns, markEdits, scope);
            var encoded = Uri.EscapeDataString(filename);
            Response.Headers.ContentDisposition = $"attachment; filename*=UTF-8''{encoded}";
            Response.Headers.CacheControl = "no-store";
            return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        }
        catch (InvalidDataException ex) { return Bad(ex.Message); }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status413PayloadTooLarge, ApiResponse.Failure(ex.Message));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    /// <summary>تصدير لحظي بتشكيلة أعمدة مرسلة في الجسم (دون حفظ قالب).</summary>
    [HttpPost("export-templates/export-adhoc")]
    public async Task<IActionResult> ExportAdhoc([FromBody] CustomExportRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.CustomExportRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (request is null || request.FileId == Guid.Empty || request.Columns is null)
            return Bad("بيانات التصدير غير مكتملة.");
        try
        {
            var scope = await Auth.ResolveDataScope(user);
            var (bytes, filename) = await templates.BuildCustomExportAsync(
                request.FileId, request.Columns, request.MarkEdits, scope);
            var encoded = Uri.EscapeDataString(filename);
            Response.Headers.ContentDisposition = $"attachment; filename*=UTF-8''{encoded}";
            Response.Headers.CacheControl = "no-store";
            return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        }
        catch (InvalidDataException ex) { return Bad(ex.Message); }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status413PayloadTooLarge, ApiResponse.Failure(ex.Message));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    /// <summary>فحص ملف استيراد قالب: أسماء الأوراق وعناوين صفها الأول
    /// لتعبئة محرر القالب واقتراح الربط بالأعمدة الأصلية.</summary>
    [HttpPost("export-templates/import-inspect")]
    public async Task<IActionResult> ImportInspect(IFormFile file)
    {
        var user = await RequirePermissionAsync(Permissions.CustomExportRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (file is null) return Bad("يرجى اختيار ملف Excel.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(file.FileName, @"\.(xlsx|xls)$", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            return Bad("الصيغ المقبولة هي XLSX وXLS فقط.");
        if (file.Length > 10 * 1024 * 1024)
            return StatusCode(StatusCodes.Status413PayloadTooLarge,
                ApiResponse.Failure("حجم ملف الاستيراد يتجاوز الحد المسموح وهو 10 ميغابايت."));
        try
        {
            await using var stream = file.OpenReadStream();
            var sheets = await importInspector.InspectAsync(stream, file.FileName, HttpContext.RequestAborted);
            return Ok(ApiResponse.Success(new { sheets }));
        }
        catch (InvalidDataException ex) { return Bad(ex.Message); }
        catch (Exception ex) { return HandleError(ex); }
    }
}
