using ExcelArchive.Api.Common.Http;
using ExcelArchive.Application.DTOs.SheetMergeDto;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.Common;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class SheetMergeController(IAuthService auth, ISheetMergeService sheets) : ApiControllerBase(auth)
{
    [HttpPost("sheet-merge/upload")]
    [RequestSizeLimit(50 * 1024 * 1024)]
    public async Task Upload(IFormFile? file)
    {
        var user = await RequirePermissionAsync(Permissions.SheetMergeView);
        if (user is null)
        {
            await Denied();
            return;
        }
        if (file is null)
        {
            await JsonError("يرجى اختيار ملف Excel.", StatusCodes.Status400BadRequest);
            return;
        }
        // ClosedXML reads XLSX only (V1 accepted XLS via ExcelJS): advertise
        // XLSX alone instead of a broken .xls promise.
        if (!System.Text.RegularExpressions.Regex.IsMatch(file.FileName, @"\.xlsx$",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
        {
            await JsonError("الصيغ المقبولة هي XLSX فقط.", StatusCodes.Status400BadRequest);
            return;
        }
        if (file.Length > 50 * 1024 * 1024)
        {
            await JsonError("حجم الملف يتجاوز الحد المسموح وهو 50 ميغابايت.",
                StatusCodes.Status413PayloadTooLarge);
            return;
        }
        byte[] bytes;
        using (var ms = new MemoryStream())
        {
            await file.OpenReadStream().CopyToAsync(ms);
            bytes = ms.ToArray();
        }
        var fileName = file.FileName;
        // V1 streams NDJSON progress + ready (or error) for the upload.
        Response.ContentType = "application/x-ndjson";
        Response.Headers.CacheControl = "no-store";
        var ct = HttpContext.RequestAborted;
        await NdjsonWriter.StreamAsync(Response.Body, async emit =>
        {
            try
            {
                var inspection = await sheets.UploadAsync(bytes, fileName,
                    (percent, detail) => NdjsonWriter.EmitSync(emit, NdjsonWriter.Progress(percent, detail)), ct);
                await emit(NdjsonWriter.Ready(new
                {
                    uploadId = inspection.UploadId,
                    originalFilename = inspection.OriginalFilename,
                    sheetCount = inspection.SheetCount,
                    sheets = inspection.Sheets.Select(s => new
                    {
                        name = s.Name, hidden = s.Hidden, rowCount = s.RowCount,
                        columnCount = s.ColumnCount, firstColumnHeader = s.FirstColumnHeader,
                        filtersRemoved = s.FiltersRemoved, linkable = s.Linkable, reason = s.Reason,
                    }).ToList(),
                    main = new
                    {
                        name = inspection.Main.Name, headers = inspection.Main.Headers,
                        preview = inspection.Main.Preview, rowCount = inspection.Main.RowCount,
                    },
                    suggestion = new { index = inspection.Suggestion.Index, reason = inspection.Suggestion.Reason },
                }));
            }
            catch (Exception ex) when (ex is InvalidDataException)
            {
                await emit(NdjsonWriter.Error(ex.Message));
            }
            catch (Exception)
            {
                await emit(NdjsonWriter.Error("تعذر قراءة الملف."));
            }
        }, ct);
    }

    [HttpPost("sheet-merge/run")]
    public async Task Run([FromBody] SheetMergeRunRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.SheetMergeView);
        if (user is null)
        {
            await Denied();
            return;
        }
        if (request is null || request.UploadId == Guid.Empty
            || request.NationalIdColumn < 0
            || request.SheetNames is null || request.SheetNames.Count == 0 || request.SheetNames.Count > 250
            || request.SheetNames.Any(string.IsNullOrWhiteSpace))
        {
            await JsonError("بيانات الدمج غير صالحة. تأكد من تحديد الصفحة الأولى وعمود الرقم الوطني.",
                StatusCodes.Status400BadRequest);
            return;
        }
        var uploadId = request.UploadId;
        var nationalIdColumn = request.NationalIdColumn;
        var sheetNames = request.SheetNames.Select(n => n.Trim()).ToList();
        Response.ContentType = "application/x-ndjson";
        Response.Headers.CacheControl = "no-store";
        var ct = HttpContext.RequestAborted;
        await NdjsonWriter.StreamAsync(Response.Body, async emit =>
        {
            try
            {
                var result = await sheets.RunAsync(uploadId, nationalIdColumn, sheetNames,
                    (percent, detail) => NdjsonWriter.EmitSync(emit, NdjsonWriter.Progress(percent, detail)), ct);
                await emit(NdjsonWriter.Result(new
                {
                    sessionId = result.SessionId,
                    originalFilename = result.OriginalFilename,
                    mainSheetName = result.MainSheetName,
                    nationalIdColumn = result.NationalIdColumn,
                    nationalIdHeader = result.NationalIdHeader,
                    exportHeaders = result.ExportHeaders,
                    exportRowCount = result.ExportRowCount,
                    linkPercent = result.LinkPercent,
                    sheets = result.Sheets.Select(s => new
                    {
                        sheetName = s.SheetName, role = s.Role, headers = s.Headers,
                        unlinkedHeaders = s.UnlinkedHeaders, rowCount = s.RowCount,
                        linkedCount = s.LinkedCount, percent = s.Percent,
                        validKeyCount = s.ValidKeyCount, invalidCount = s.InvalidCount,
                        duplicateCount = s.DuplicateCount, missingCount = s.MissingCount,
                        unlinkedTotal = s.UnlinkedTotal,
                        unlinked = s.Unlinked.Select(u => new
                        {
                            rowNumber = u.RowNumber, value = u.Value,
                            reason = u.Reason, cells = u.Cells,
                        }).ToList(),
                    }).ToList(),
                }));
            }
            catch (Exception ex) when (ex is InvalidDataException || ex is KeyNotFoundException)
            {
                await emit(NdjsonWriter.Error(ex.Message));
            }
            catch (Exception)
            {
                await emit(NdjsonWriter.Error("تعذر تنفيذ دمج الصفحات."));
            }
        }, ct);
    }

    [HttpPost("sheet-merge/export")]
    public async Task Export([FromBody] SheetMergeExportRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.SheetMergeView);
        if (user is null)
        {
            await Denied();
            return;
        }
        if (request is null || request.SessionId == Guid.Empty)
        {
            await JsonError("معرّف الجلسة غير صالح.", StatusCodes.Status400BadRequest);
            return;
        }
        var sessionId = request.SessionId;
        Response.ContentType = "application/x-ndjson";
        Response.Headers.CacheControl = "no-store";
        var ct = HttpContext.RequestAborted;
        await NdjsonWriter.StreamAsync(Response.Body, async emit =>
        {
            try
            {
                // V1 scales export progress into the first 60%.
                var ready = await sheets.PrepareExportAsync(sessionId,
                    (percent, detail) => NdjsonWriter.EmitSync(emit,
                        NdjsonWriter.Progress((int)Math.Round(percent * 0.6), detail)), ct);
                await emit(NdjsonWriter.Ready(new
                {
                    downloadId = ready.DownloadId, filename = ready.Filename,
                    size = ready.Size, sheetCount = ready.SheetCount,
                }));
            }
            catch (Exception ex) when (ex is InvalidDataException || ex is KeyNotFoundException)
            {
                await emit(NdjsonWriter.Error(ex.Message));
            }
            catch (Exception)
            {
                await emit(NdjsonWriter.Error("تعذر تصدير الملف."));
            }
        }, ct);
    }

    private Task Denied()
    {
        Response.StatusCode = IsAuthenticated
            ? StatusCodes.Status404NotFound : StatusCodes.Status401Unauthorized;
        return Response.WriteAsJsonAsync(ApiResponse.Failure(
            IsAuthenticated ? "غير موجود." : "انتهت الجلسة. يرجى تسجيل الدخول من جديد."));
    }

    private Task JsonError(string message, int status)
    {
        Response.StatusCode = status;
        return Response.WriteAsJsonAsync(ApiResponse.Failure(message));
    }

    [HttpGet("sheet-merge/download")]
    [HttpGet("sheet-merge/download/{id:guid}")]
    public async Task<IActionResult> Download([FromQuery] Guid id, Guid sessionId = default)
    {
        var user = await RequirePermissionAsync(Permissions.SheetMergeView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var downloadId = id != Guid.Empty ? id : sessionId;
        if (downloadId == Guid.Empty) return Bad("معرّف التصدير مفقود.");
        try
        {
            var (bytes, filename, size) = sheets.Download(downloadId);
            var encoded = Uri.EscapeDataString(filename);
            Response.Headers["Content-Disposition"] =
                $"attachment; filename=\"sheet-merge.xlsx\"; filename*=UTF-8''{encoded}";
            Response.Headers["Content-Length"] = size.ToString();
            Response.Headers.CacheControl = "no-store";
            return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        }
        catch (Exception ex) { return HandleError(ex); }
    }
}

public record SheetMergeRunRequest(Guid UploadId, int NationalIdColumn, List<string> SheetNames);
public record SheetMergeExportRequest(Guid SessionId);
