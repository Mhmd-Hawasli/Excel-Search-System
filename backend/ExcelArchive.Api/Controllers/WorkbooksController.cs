using ExcelArchive.Application.Common;
using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class WorkbooksController(IWorkbookInspector inspector, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpPost("workbooks/inspect")]
    [DisableRequestSizeLimit]
    public async Task<IActionResult> Inspect(IFormFile file)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (file is null) return Bad("يرجى اختيار ملف Excel.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(file.FileName, @"\.(xlsx|xls)$", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            return Bad("الصيغ المقبولة هي XLSX وXLS فقط.");
        if (file.Length > 50 * 1024 * 1024)
            return StatusCode(StatusCodes.Status413PayloadTooLarge,
                ApiResponse.Failure("حجم الملف يتجاوز الحد المسموح وهو 50 ميغابايت."));
        try
        {
            await using var stream = file.OpenReadStream();
            return Ok(ApiResponse.Success(await inspector.InspectAsync(stream, file.FileName)));
        }
        catch (Exception ex) when (ex is InvalidDataException) { return Bad(ex.Message, StatusCodes.Status422UnprocessableEntity); }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPost("workbooks/sheet")]
    public async Task<IActionResult> Sheet([FromBody] SheetInspectRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (request is null || request.Token == Guid.Empty || string.IsNullOrWhiteSpace(request.SheetName))
            return Bad("بيانات الورقة غير صالحة.");
        try
        {
            return Ok(ApiResponse.Success(await inspector.InspectSheetAsync(request.Token, request.SheetName)));
        }
        catch (KeyNotFoundException ex) { return Bad(ex.Message, StatusCodes.Status422UnprocessableEntity); }
        catch (Exception ex) when (ex is InvalidDataException) { return Bad(ex.Message, StatusCodes.Status422UnprocessableEntity); }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPost("workbooks/linked")]
    public async Task<IActionResult> Linked([FromBody] LinkedSheetsRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.UploadRun);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (request is null || request.Token == Guid.Empty || request.LinkedSheets is null || request.LinkedSheets.Count == 0)
            return Bad("اختر الأوراق الإضافية وعمود الرقم الوطني في الورقة الأساسية.");
        try
        {
            var inspection = await inspector.InspectLinkedAsync(request.Token,
                new LinkedSheetsConfig([.. request.LinkedSheets], request.NationalIdColumnIndex));
            return Ok(ApiResponse.Success(inspection));
        }
        catch (Exception ex) when (ex is InvalidDataException) { return Bad(ex.Message, StatusCodes.Status422UnprocessableEntity); }
        catch (KeyNotFoundException ex) { return Bad(ex.Message, StatusCodes.Status422UnprocessableEntity); }
        catch (Exception ex) { return HandleError(ex); }
    }
}

