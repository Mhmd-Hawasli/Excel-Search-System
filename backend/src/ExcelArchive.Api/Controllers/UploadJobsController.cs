using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Common;
using ExcelArchive.Api.DTOs.Upload;
using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Controllers;

public class UploadJobsController(IUploadService upload, IAuthService auth, AppDbContext db) : ApiControllerBase(auth)
{
    [HttpPost("upload-jobs")]
    public async Task<IActionResult> Create([FromBody] CreateUploadJobRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var group = await db.Groups.AsNoTracking().FirstOrDefaultAsync(g => g.Id == request.GroupId);
        if (group is null) return Bad("المجموعة المحددة غير موجودة.", StatusCodes.Status404NotFound);
        try
        {
            return StatusCode(StatusCodes.Status202Accepted,
                ApiResponse.Success(await upload.CreateJobAsync(request, user.Username)));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpGet("upload-jobs/{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var job = await upload.GetJobAsync(id);
        return job is null ? HiddenNotFound() : Ok(ApiResponse.Success(job));
    }

    [HttpPost("upload-jobs/{id:guid}/template")]
    public async Task<IActionResult> SaveTemplate(Guid id, [FromBody] SaveTemplateRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            return Ok(ApiResponse.Success(await upload.SaveTemplateAsync(id, request, user.Username)));
        }
        catch (Exception ex) { return HandleError(ex); }
    }
}
