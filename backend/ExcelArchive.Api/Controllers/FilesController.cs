using ExcelArchive.Application.Common;
using ExcelArchive.Api.Common.Http;
using ExcelArchive.Application.DTOs.FileDto;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Domain.Text;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class FilesController(IFileService files, IAuthService auth, IFileExportBuilder exports, IReplacePreviewService? preview = null) : ApiControllerBase(auth)
{
    [HttpPost("files/check-name")]
    public async Task<IActionResult> CheckName([FromBody] CheckFileNameRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var name = request?.Name?.Trim() ?? "";
        if (name.Length < 2 || name.Length > 160)
            return StatusCode(StatusCodes.Status400BadRequest,
                new CheckFileNameResponse(false, "يجب أن يتراوح اسم الملف بين حرفين و160 حرفًا."));
        try
        {
            var (available, error) = await files.CheckNameAsync(name);
            if (!available)
                return StatusCode(StatusCodes.Status409Conflict,
                    new CheckFileNameResponse(false, error ?? "اسم الملف مستخدم مسبقًا. اختر اسمًا آخر."));
            return Ok(new CheckFileNameResponse(true));
        }
        catch
        {
            return StatusCode(StatusCodes.Status500InternalServerError,
                new CheckFileNameResponse(false, "تعذر التحقق من اسم الملف. حاول مجددًا."));
        }
    }

    [HttpGet("files/{id:guid}")]
    public async Task<IActionResult> Get(Guid id, [FromQuery] Guid? groupId)
    {
        // Read access: global groups.view OR a scoped grant covering this
        // file. Previously this required the GLOBAL groups.view only, which
        // locked every scoped (viewScoped) user out of their own files (404).
        var user = CurrentUser ?? await Auth.GetSessionUserAsync(Request.Cookies[SessionCookie.Name]);
        if (user is null) return UnauthorizedSession();
        if (!Auth.HasPermission(user, Permissions.GroupsView)
            && !Auth.HasPermission(user, Permissions.SearchView))
            return HiddenNotFound();
        var scope = await Auth.ResolveDataScope(user);
        if (scope.FileIds is not null && !scope.FileIds.Contains(id)) return HiddenNotFound();
        var detail = await files.GetDetailAsync(id, Auth.HasPermission(user, Permissions.EditsView));
        if (detail is null) return HiddenNotFound();
        if (groupId.HasValue && detail.File.GroupId != groupId.Value) return HiddenNotFound();
        return Ok(ApiResponse.Success(detail));
    }

    [HttpGet("files/{id:guid}/quality")]
    public async Task<IActionResult> Quality(Guid id, [FromQuery] Guid? groupId)
    {
        var user = CurrentUser ?? await Auth.GetSessionUserAsync(Request.Cookies[SessionCookie.Name]);
        if (user is null) return UnauthorizedSession();
        if (!Auth.HasPermission(user, Permissions.GroupsView)
            && !Auth.HasPermission(user, Permissions.SearchView))
            return HiddenNotFound();
        var scope = await Auth.ResolveDataScope(user);
        if (scope.FileIds is not null && !scope.FileIds.Contains(id)) return HiddenNotFound();
        var file = await files.GetAsync(id);
        if (file is null) return HiddenNotFound();
        if (groupId.HasValue && file.GroupId != groupId.Value) return HiddenNotFound();
        var quality = await files.GetQualityAsync(id);
        return quality is null ? HiddenNotFound() : Ok(ApiResponse.Success(quality));
    }

    [HttpGet("files/{id:guid}/mapping")]
    public async Task<IActionResult> GetMapping(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.UploadView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var file = await files.GetAsync(id);
        if (file is null) return NotFound(ApiResponse.Failure("الملف غير موجود."));
        var scope = await Auth.ResolveDataScope(user);
        if (scope.FileIds is not null && !scope.FileIds.Contains(id)) return HiddenNotFound();
        var result = await files.GetMappingAsync(id);
        return result is null ? HiddenNotFound() : Ok(ApiResponse.Success(result));
    }

    [HttpPost("files/{id:guid}/mapping")]
    public async Task<IActionResult> UpdateMapping(Guid id, [FromBody] UpdateMappingRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var file = await files.GetAsync(id);
        if (file is null) return NotFound(ApiResponse.Failure("الملف غير موجود."));
        var scope = await Auth.ResolveDataScope(user);
        if (scope.FileIds is not null && !scope.FileIds.Contains(id)) return HiddenNotFound();
        if (request?.Columns is null)
            return Bad("بيانات الأعمدة غير صالحة.");
        var normalized = new List<UpdateColumnMappingDto>();
        foreach (var col in request.Columns)
        {
            if (col is null) return Bad("بيانات الأعمدة غير صالحة.");
            var field = col.StandardField == "" ? null : col.StandardField;
            if (field is not null && StandardFieldKeys.Parse(field) is null)
                return Bad($"حقل قياسي غير معروف: {field}");
            normalized.Add(col with { StandardField = field });
        }
        var seen = new HashSet<string>();
        foreach (var col in normalized)
        {
            if (col.StandardField is null) continue;
            if (!seen.Add(col.StandardField))
                return Bad("لا يمكن ربط حقل قياسي واحد بأكثر من عمود.");
        }
        try
        {
            var updated = await files.UpdateMappingAsync(id,
                new UpdateMappingRequest(normalized, request.PkColumnId, request.ConfirmPkChange), user.Username);
            return Ok(ApiResponse.Success(new { ok = true, updatedRecords = updated }));
        }
        catch (Exception ex)
        {
            var message = ex.Message;
            var known = message.Contains("لا يمكن") || message.Contains("غير موجود")
                || message.Contains("لا يطابق") || message.Contains("غير معروف")
                || message.Contains("ينتمي") || message.Contains("سيحذف")
                || message.Contains("أكّد") || message.Contains("مفتاح الربط")
                || message.Contains("بدون حقل") || message.Contains("تحديد عمود");
            return known ? Bad(message) : HandleError(ex);
        }
    }

    [HttpDelete("files/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, [FromBody] DeleteFileRequest? request)
    {
        // Destructive: requires management power (previously groups.view, so
        // ANY read-only user could delete any file) plus data-scope cover.
        var user = await RequirePermissionAsync(Permissions.GroupsUpdate);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (request is null || string.IsNullOrEmpty(request.ConfirmName))
            return Bad("اسم التأكيد مطلوب لحذف الملف.");
        var scope = await Auth.ResolveDataScope(user);
        if (scope.FileIds is not null && !scope.FileIds.Contains(id)) return HiddenNotFound();
        try
        {
            await files.DeleteAsync(id, request.ConfirmName, user.Username);
            return Ok(ApiResponse.Success(null, "تم حذف الملف وكل سجلاته."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPost("files/{id:guid}/move")]
    public async Task<IActionResult> Move(Guid id, [FromBody] MoveFileRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.GroupsUpdate);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (request is null || request.TargetGroupId == Guid.Empty)
            return Bad("حدد المجموعة الجديدة للملف.");
        var scope = await Auth.ResolveDataScope(user);
        // Scoped managers may only move files they can see, and only into
        // groups they can see (global managers: scope lists are null).
        if (scope.FileIds is not null && !scope.FileIds.Contains(id)) return HiddenNotFound();
        if (scope.GroupIds is not null && !scope.GroupIds.Contains(request.TargetGroupId))
            return Bad("المجموعة الجديدة خارج نطاق صلاحياتك.");
        try
        {
            await files.MoveAsync(id, request.TargetGroupId, user.Username);
            return Ok(ApiResponse.Success(null, "تم نقل الملف إلى المجموعة الجديدة."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpGet("files/{id:guid}/export")]
    public async Task<IActionResult> Export(Guid id, [FromQuery] bool markEdits = false, [FromQuery] int? version = null)
    {
        var user = await RequirePermissionAsync(Permissions.ExportRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var scope = await Auth.ResolveDataScope(user);
        if (scope.FileIds is not null && !scope.FileIds.Contains(id)) return HiddenNotFound();
        try
        {
            var data = version.HasValue
                ? await files.GetVersionExportDataAsync(id, version.Value)
                : await files.GetExportDataAsync(id);
            if (data is null) return NotFound(ApiResponse.Failure("الملف غير موجود."));

            var bytes = exports.Build(data.SheetName, data.Headers, data.Records, data.Edits, markEdits, data.NationalIdHeader);

            var date = DateTime.UtcNow.ToString("yyyy-MM-dd");
            var suffix = version.HasValue ? $"-v{version.Value}" : "-معدل";
            var encoded = Uri.EscapeDataString($"{data.FileName}{suffix}-{date}.xlsx");
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

    [HttpPost("files/{id:guid}/replace")]
    public async Task<IActionResult> Replace(Guid id, [FromBody] ReplaceFileRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var target = await files.GetAsync(id);
        if (target is null) return NotFound(ApiResponse.Failure("الملف المراد تحديثه غير موجود."));
        var scope = await Auth.ResolveDataScope(user);
        if (scope.FileIds is not null && !scope.FileIds.Contains(id)) return HiddenNotFound();
        if (request is null || request.Token is null || request.Token == Guid.Empty
            || string.IsNullOrWhiteSpace(request.OriginalFilename) || request.OriginalFilename.Length > 255
            || string.IsNullOrWhiteSpace(request.SheetName) || request.SheetName.Length > 255
            || request.SheetIndex < 1 || request.TotalRows < 0
            || request.Columns is null || request.Columns.Count == 0
            || (request.Mode != "same" && request.Mode != "different"))
            return Bad("إعدادات الاستبدال غير مكتملة.");
        var columns = request.Columns.Select(c => new ReplaceColumnDto(
            c.HeaderRaw ?? "", c.HeaderNormalized ?? "", c.ColumnIndex, c.StandardField, c.CategoryId)).ToList();
        if (columns.Any(c => string.IsNullOrWhiteSpace(c.HeaderRaw) || c.ColumnIndex < 1))
            return Bad("إعدادات الاستبدال غير مكتملة.");
        try
        {
            var jobId = await files.CreateReplaceJobAsync(id, request, user.Username);
            return StatusCode(StatusCodes.Status202Accepted, ApiResponse.Success(new { jobId }, "تم بدء استبدال الملف."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    /// <summary>Manual version bump N → N+1 with a required note describing
    /// WHAT changed. Live manual edits are archived into history; the new
    /// version starts clean. Requires the versions.bump permission.</summary>
    [HttpPost("files/{id:guid}/bump-version")]
    public async Task<IActionResult> BumpVersion(Guid id, [FromBody] BumpVersionRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.VersionsBump);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var target = await files.GetAsync(id);
        if (target is null) return NotFound(ApiResponse.Failure("الملف غير موجود."));
        var scope = await Auth.ResolveDataScope(user);
        if (scope.FileIds is not null && !scope.FileIds.Contains(id)) return HiddenNotFound();
        try
        {
            var result = await files.BumpVersionAsync(id, request?.Note, user.Username);
            return Ok(ApiResponse.Success(result,
                $"تم رفع الإصدار من {result.PreviousVersion} إلى {result.NewVersion}."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    /// <summary>Version history newest-first with per-version edit counts and
    /// the pending (live) manual edit count on the current version.</summary>
    [HttpGet("files/{id:guid}/versions")]
    public async Task<IActionResult> Versions(Guid id)
    {
        var user = CurrentUser ?? await Auth.GetSessionUserAsync(Request.Cookies[SessionCookie.Name]);
        if (user is null) return UnauthorizedSession();
        if (!Auth.HasPermission(user, Permissions.GroupsView)
            && !Auth.HasPermission(user, Permissions.SearchView))
            return HiddenNotFound();
        var scope = await Auth.ResolveDataScope(user);
        if (scope.FileIds is not null && !scope.FileIds.Contains(id)) return HiddenNotFound();
        var versions = await files.GetVersionsAsync(id);
        return versions is null ? HiddenNotFound() : Ok(ApiResponse.Success(versions));
    }

    /// <summary>Cell-by-cell replace preview: column check first, then every
    /// cell of the staged workbook vs the stored rows, flagging values that
    /// were manually edited internally. Read-only, capped payload.</summary>
    [HttpPost("files/{id:guid}/replace-preview")]
    public async Task<IActionResult> ReplacePreview(Guid id, [FromBody] ReplaceFileRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var target = await files.GetAsync(id);
        if (target is null) return NotFound(ApiResponse.Failure("الملف المراد تحديثه غير موجود."));
        var scope = await Auth.ResolveDataScope(user);
        if (scope.FileIds is not null && !scope.FileIds.Contains(id)) return HiddenNotFound();
        if (request is null || request.Token is null || request.Token == Guid.Empty
            || string.IsNullOrWhiteSpace(request.OriginalFilename) || request.OriginalFilename.Length > 255
            || string.IsNullOrWhiteSpace(request.SheetName) || request.SheetName.Length > 255
            || request.SheetIndex < 1 || request.TotalRows < 0
            || request.Columns is null || request.Columns.Count == 0
            || (request.Mode != "same" && request.Mode != "different"))
            return Bad("إعدادات الاستبدال غير مكتملة.");
        try
        {
            if (preview is null) return HandleError(new InvalidOperationException("خدمة المعاينة غير متاحة."));
            var result = await preview.PreviewAsync(id, request);
            return Ok(ApiResponse.Success(result));
        }
        catch (Exception ex) { return HandleError(ex); }
    }
}
