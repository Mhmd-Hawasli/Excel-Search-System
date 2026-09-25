using ExcelArchive.Application.Common;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class UploadJobsController(IUploadService upload, IAuthService auth, IGroupService groups) : ApiControllerBase(auth)
{
    [HttpPost("upload-jobs")]
    public async Task<IActionResult> Create([FromBody] CreateUploadJobRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (request is null || request.GroupId == Guid.Empty)
            return Bad("حدد المجموعة المستهدفة للاستيراد.");
        // Resolve the caller's scope FIRST: group existence must not leak to
        // scoped users via a null (unrestricted) scope probe.
        var scope = await Auth.ResolveDataScope(user);
        if (scope.GroupIds is not null && !scope.GroupIds.Contains(request.GroupId))
            return HiddenNotFound();
        var group = await groups.GetAsync(request.GroupId, scope);
        if (group is null) return Bad("المجموعة المحددة غير موجودة.", StatusCodes.Status404NotFound);
        try
        {
            return StatusCode(StatusCodes.Status202Accepted,
                ApiResponse.Success(await upload.CreateJobAsync(request, user.Username)));
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("مستخدم بالفعل"))
        {
            return StatusCode(StatusCodes.Status409Conflict, ApiResponse.Failure(ex.Message));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpGet("upload-jobs/templates")]
    public async Task<IActionResult> Templates([FromQuery] Guid? groupId)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var scope = await Auth.ResolveDataScope(user);
        var rows = await upload.ListTemplatesAsync(groupId, scope);
        return Ok(ApiResponse.Success(new
        {
            templates = rows.Select(t => new { id = t.Id, groupId = t.GroupId, name = t.Name, mapping = t.Mapping }),
        }));
    }

    [HttpGet("upload-jobs/{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var scope = await Auth.ResolveDataScope(user);
        var job = await upload.GetJobAsync(id, scope);
        return job is null ? HiddenNotFound() : Ok(ApiResponse.Success(job));
    }

    [HttpPost("upload-jobs/{id:guid}/template")]
    public async Task<IActionResult> SaveTemplate(Guid id, [FromBody] SaveTemplateRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (request is null) return Bad("بيانات القالب غير صالحة.");
        var scope = await Auth.ResolveDataScope(user);
        try
        {
            return Ok(ApiResponse.Success(await upload.SaveTemplateAsync(id, request, user.Username, scope)));
        }
        catch (KeyNotFoundException)
        {
            // Out-of-scope or missing job: hide as not-found (same as Create/Get).
            return HiddenNotFound();
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("يوجد قالب"))
        {
            return StatusCode(StatusCodes.Status409Conflict, ApiResponse.Failure(ex.Message));
        }
        catch (Exception ex) { return HandleError(ex); }
    }
}
