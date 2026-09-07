using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class BackupController(IBackupService backup, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpGet("backup/export")]
    public async Task<IActionResult> Export()
    {
        var user = await RequirePermissionAsync(Permissions.BackupExport);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var bytes = await backup.ExportAsync();
        Response.Headers.ContentDisposition =
            $"attachment; filename=\"excel-archive-backup-{DateTime.UtcNow:yyyy-MM-dd}.json\"";
        return File(bytes, "application/json; charset=utf-8");
    }

    [HttpPost("backup/restore")]
    public async Task<IActionResult> Restore(IFormFile file, [FromForm] string? confirmation = null)
    {
        var user = await RequirePermissionAsync(Permissions.BackupRestore);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (confirmation != "استعادة") return Bad("اكتب كلمة «استعادة» لتأكيد حذف البيانات الحالية.");
        if (file is null || !file.FileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            return Bad("اختر ملف نسخة احتياطية بصيغة JSON.");
        if (file.Length > 250 * 1024 * 1024)
            return StatusCode(StatusCodes.Status413PayloadTooLarge, "حجم ملف النسخة يتجاوز 250 ميغابايت.");
        try
        {
            await using var stream = file.OpenReadStream();
            return Ok(new { ok = true, summary = await backup.RestoreAsync(stream, user.Username) });
        }
        catch (Exception ex) { return HandleError(ex); }
    }
}
