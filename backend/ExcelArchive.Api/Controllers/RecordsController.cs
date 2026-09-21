using ExcelArchive.Application.Common;
using ExcelArchive.Api.Common.Http;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.RecordDto;
using ExcelArchive.Application.DTOs.EditDto;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class RecordsController(
    IEditsService edits, IRecordService records, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpGet("records/{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.SearchView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var detail = await records.GetDetailAsync(id, user);
        return detail is null ? HiddenNotFound() : Ok(ApiResponse.Success(detail));
    }

    [HttpGet("records/{id:guid}/edits")]
    public async Task<IActionResult> GetEdits(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.EditsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var fileId = await records.GetFileIdAsync(id);
        if (fileId is null) return NotFound(ApiResponse.Failure("غير موجود."));
        var scope = await Auth.ResolveDataScope(user);
        if (scope.FileIds is not null && !scope.FileIds.Contains(fileId.Value)) return HiddenNotFound();
        try
        {
            var result = await edits.GetRecordEditsAsync(id);
            Response.Headers.CacheControl = "no-store";
            return Ok(ApiResponse.Success(result));
        }
        catch
        {
            return StatusCode(StatusCodes.Status500InternalServerError,
                ApiResponse.Failure("تعذر تحميل التعديلات."));
        }
    }

    [HttpPost("records/{id:guid}/edits")]
    public async Task<IActionResult> SaveEdit(Guid id, [FromBody] SaveEditBody? body)
    {
        var user = await RequirePermissionAsync(Permissions.EditsUpdate);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var fileId = await records.GetFileIdAsync(id);
        if (fileId is null) return NotFound(ApiResponse.Failure("غير موجود."));
        var scope = await Auth.ResolveDataScope(user);
        if (scope.FileIds is not null && !scope.FileIds.Contains(fileId.Value)) return HiddenNotFound();

        if (body is null) return Bad("جسم الطلب غير صالح.");
        if (string.IsNullOrWhiteSpace(body.FileColumnId?.ToString()) && string.IsNullOrWhiteSpace(body.HeaderRaw))
            return Bad("حدد العمود المراد تعديله.");
        if (!string.IsNullOrWhiteSpace(body.HeaderRaw) && body.HeaderRaw.Length > 500)
            return Bad("بيانات التعديل غير صالحة.");
        if (!body.Revert && body.NewValue is null)
            return Bad("حدد القيمة الجديدة.");
        try
        {
            EditResult result = body.Revert
                ? await edits.RevertAsync(id, body.FileColumnId, body.HeaderRaw, user.Username, scope)
                : await edits.SaveAsync(id, body.FileColumnId, body.HeaderRaw,
                    body.NewValue ?? "", user.Username, scope);
            if (!result.Changed)
                return Ok(ApiResponse.Success(new
                {
                    ok = true, changed = false, message = "لا يوجد تغيير للحفظ.",
                }));
            var history = await edits.GetRecordEditsAsync(id);
            return Ok(ApiResponse.Success(new
            {
                ok = true, result.Changed, result.OldValue, result.NewValue,
                edits = history.EditedHeaders,
            }));
        }
        catch (Exception ex)
        {
            var message = ex.Message;
            var known = message.Contains("غير موجود") || message.Contains("طويلة")
                || message.Contains("لا يوجد تعديل");
            return known ? Bad(message) : HandleError(ex);
        }
    }

    [HttpPost("records/{id:guid}/visit")]
    public async Task<IActionResult> Visit(Guid id)
    {
        // Visits write audit rows: require data-read power (previously ANY
        // authenticated session could write unbounded activity_log rows).
        var user = await RequirePermissionAsync(Permissions.SearchView);
        if (user is null)
            return IsAuthenticated ? HiddenNotFound() : Unauthorized(ApiResponse.Failure("انتهت الجلسة."));
        try
        {
            var scope = await Auth.ResolveDataScope(user);
            await edits.VisitAsync(id, user, scope);
            Response.Headers.CacheControl = "no-store";
            return Ok(ApiResponse.Success(new { ok = true }));
        }
        catch (KeyNotFoundException)
        {
            return NotFound(ApiResponse.Failure("غير موجود."));
        }
        catch
        {
            return StatusCode(StatusCodes.Status500InternalServerError,
                ApiResponse.Failure("تعذر تسجيل الزيارة."));
        }
    }

    [HttpGet("files/{id:guid}/record-template")]
    public async Task<IActionResult> Template(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.RecordsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var template = await records.GetTemplateAsync(id, user);
        return template is null ? HiddenNotFound() : Ok(ApiResponse.Success(template));
    }

    [HttpGet("files/{id:guid}/suggestions")]
    public async Task<IActionResult> Suggestions(Guid id, [FromQuery] string? standardField, [FromQuery] Guid? columnId, [FromQuery] int take = 50)
    {
        var user = await RequirePermissionAsync(Permissions.RecordsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var result = await records.GetSuggestionsAsync(id, standardField, columnId, take, user);
        return result is null ? HiddenNotFound() : Ok(ApiResponse.Success(result));
    }

    [HttpPost("files/{id:guid}/records")]
    public async Task<IActionResult> CreateManual(Guid id, [FromBody] CreateManualRecordRequest? body)
    {
        var user = await RequirePermissionAsync(Permissions.RecordsCreate);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (body?.Values is null) return Bad("أدخل قيمة واحدة على الأقل.");
        try
        {
            var created = await records.CreateManualAsync(id, body, user);
            return Ok(ApiResponse.Success(created, "تم إدخال السجل الجديد بنجاح."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPost("files/{id:guid}/records/validate")]
    public async Task<IActionResult> ValidateManual(Guid id, [FromBody] CreateManualRecordRequest? body)
    {
        // تدقيق زر "التالي": فحص التكرار داخل الملف بدون إنشاء سجل.
        var user = await RequirePermissionAsync(Permissions.RecordsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (body?.Values is null) return Ok(ApiResponse.Success(new { ok = true }));
        try
        {
            await records.ValidateManualAsync(id, body, user);
            return Ok(ApiResponse.Success(new { ok = true }));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpDelete("records/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.RecordsDelete);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            var deleted = await records.DeleteAsync(id, user);
            return deleted is null
                ? HiddenNotFound()
                : Ok(ApiResponse.Success(deleted, "تم حذف السجل نهائياً."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }
}

