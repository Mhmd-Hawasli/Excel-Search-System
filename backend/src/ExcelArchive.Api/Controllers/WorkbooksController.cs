using ExcelArchive.Api.DTOs.Upload;
using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class WorkbooksController(IUploadService upload, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpPost("workbooks/inspect")]
    [RequestSizeLimit(50 * 1024 * 1024)]
    public async Task<IActionResult> Inspect(IFormFile file)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (file is null) return Bad("يرجى اختيار ملف Excel.");
        try
        {
            await using var stream = file.OpenReadStream();
            return Ok(ApiResponse.Success(await upload.InspectAsync(stream, file.FileName)));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPost("workbooks/sheet")]
    public async Task<IActionResult> Sheet([FromBody] SheetInspectRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        return Ok(ApiResponse.Success(new { token = request.Token, sheetName = request.SheetName, columns = Array.Empty<object>(), errors = Array.Empty<object>() }));
    }

    [HttpPost("workbooks/linked")]
    public async Task<IActionResult> Linked([FromBody] LinkedSheetsRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        return Ok(ApiResponse.Success(new { token = request.Token, linkedSheets = request.LinkedSheets, columns = Array.Empty<object>(), errors = Array.Empty<object>() }));
    }
}

public record SheetInspectRequest(Guid Token, string SheetName);
public record LinkedSheetsRequest(Guid Token, IReadOnlyList<string> LinkedSheets);
