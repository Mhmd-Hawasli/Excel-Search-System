using System.Text.Json;
using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Common;
using ExcelArchive.Api.DTOs.Files;
using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Controllers;

public class FilesController(IFileService files, IUploadService upload, IAuthService auth, AppDbContext db) : ApiControllerBase(auth)
{
    [HttpPost("files/check-name")]
    public async Task<IActionResult> CheckName([FromBody] CheckFileNameRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var (available, error) = await files.CheckNameAsync(request.Name);
        return Ok(new CheckFileNameResponse(available, error ?? (available ? null : "اسم الملف مستخدم مسبقًا. اختر اسمًا آخر.")));
    }

    [HttpGet("files/{id:guid}/mapping")]
    public async Task<IActionResult> GetMapping(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.UploadView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var result = await files.GetMappingAsync(id);
        return result is null ? HiddenNotFound() : Ok(ApiResponse.Success(result));
    }

    [HttpPost("files/{id:guid}/mapping")]
    public async Task<IActionResult> UpdateMapping(Guid id, [FromBody] UpdateMappingRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            var result = await files.UpdateMappingAsync(id, request);
            return Ok(ApiResponse.Success(result, "تم حفظ ربط الأعمدة."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpDelete("files/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, [FromBody] DeleteFileRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.GroupsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            await files.DeleteAsync(id, request.ConfirmName, user.Username);
            return Ok(ApiResponse.Success(null, "تم حذف الملف وكل سجلاته."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpGet("files/{id:guid}/export")]
    public async Task<IActionResult> Export(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.ExportRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var file = await db.Files.AsNoTracking().FirstOrDefaultAsync(f => f.Id == id);
        if (file is null) return HiddenNotFound();
        var records = await db.Records.AsNoTracking().Where(r => r.FileId == id).OrderBy(r => r.RowIndex).ToListAsync();
        var columns = await db.FileColumns.AsNoTracking().Where(c => c.FileId == id).OrderBy(c => c.ColumnIndex).ToListAsync();

        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add(string.IsNullOrWhiteSpace(file.SheetName) ? "البيانات" : file.SheetName);
        foreach (var (column, index) in columns.Select((c, i) => (c, i + 1)))
            sheet.Cell(1, index).Value = column.HeaderRaw;
        var row = 2;
        foreach (var record in records)
        {
            var data = record.Data.RootElement;
            foreach (var (column, index) in columns.Select((c, i) => (c, i + 1)))
            {
                sheet.Cell(row, index).Value = data.TryGetProperty(column.HeaderRaw, out var value)
                    ? value.GetRawText()
                    : "";
            }
            row++;
        }
        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        var date = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var filename = $"{file.Name}-معدل-{date}.xlsx";
        var encoded = Uri.EscapeDataString(filename);
        Response.Headers.ContentDisposition = $"attachment; filename=\"archive.xlsx\"; filename*=UTF-8''{encoded}";
        return File(ms.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }

    [HttpPost("files/{id:guid}/replace")]
    public async Task<IActionResult> Replace(Guid id, [FromBody] ReplaceFileRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            return Ok(ApiResponse.Success(new { jobId = Guid.NewGuid() }, "تم بدء استبدال الملف."));
        }
        catch (Exception ex) { return HandleError(ex); }
    }
}
