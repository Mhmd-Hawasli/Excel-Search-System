using ExcelArchive.Application.Common;
using ExcelArchive.Api.Common.Http;
using ExcelArchive.Application.DTOs.MergeDto;
using ExcelArchive.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

public class MergeController(IAuthService auth, IMergeService merge) : ApiControllerBase(auth)
{
    [HttpPost("merge/inspect")]
    [RequestSizeLimit(50 * 1024 * 1024)]
    public async Task<IActionResult> Inspect(IFormFile file)
    {
        var user = await RequirePermissionAsync(Permissions.MergeView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (file is null) return Bad("يرجى اختيار ملف Excel.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(file.FileName, @"\.(xlsx|xls)$",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            return Bad("الصيغ المقبولة هي XLSX وXLS فقط.");
        if (file.Length > 50 * 1024 * 1024)
            return StatusCode(StatusCodes.Status413PayloadTooLarge,
                ApiResponse.Failure("حجم الملف يتجاوز الحد المسموح وهو 50 ميغابايت."));
        try
        {
            using var ms = new MemoryStream();
            await file.OpenReadStream().CopyToAsync(ms);
            var inspection = merge.Inspect(ms.ToArray(), file.FileName);
            return Ok(ApiResponse.Success(new
            {
                token = inspection.Token,
                originalFilename = inspection.OriginalFilename,
                sheets = inspection.Sheets.Select(s => new { name = s.Name, rowCount = s.RowCount }).ToList(),
                selected = new
                {
                    sheetName = inspection.Selected.SheetName,
                    headers = inspection.Selected.Headers,
                    preview = inspection.Selected.Preview,
                    rowCount = inspection.Selected.RowCount,
                    columnCount = inspection.Selected.ColumnCount,
                },
                suggestedMapping = inspection.SuggestedMapping,
            }));
        }
        catch (InvalidDataException ex)
        {
            return Bad(ex.Message, StatusCodes.Status422UnprocessableEntity);
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPost("merge/key")]
    public async Task<IActionResult> Key([FromBody] MergeDeleteKeyRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.MergeView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (request is null || request.SessionId == Guid.Empty
            || (request.Table != "left" && request.Table != "right")
            || request.RowNumber < 2)
            return Bad("بيانات غير صالحة.");
        try
        {
            var (session, result) = merge.DeleteKey(request.SessionId, request.Table, request.RowNumber);
            return Ok(ApiResponse.Success(SerializeResult(
                session.Id, session.LeftHeaders, session.RightHeaders,
                session.IgnoreConfirmation, result)));
        }
        catch (InvalidDataException ex) { return Bad(ex.Message); }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPost("merge/sheet")]
    public async Task<IActionResult> Sheet([FromBody] MergeSheetRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.MergeView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (request is null || request.Token == Guid.Empty || string.IsNullOrWhiteSpace(request.Sheet))
            return Bad("بيانات غير صالحة.");
        try
        {
            var selected = merge.InspectSheet(request.Token, request.Sheet.Trim());
            return Ok(ApiResponse.Success(new
            {
                sheetName = selected.SheetName,
                headers = selected.Headers,
                preview = selected.Preview,
                rowCount = selected.RowCount,
                columnCount = selected.ColumnCount,
                suggestedMapping = merge.SuggestMapping(selected.Headers),
            }));
        }
        catch (KeyNotFoundException ex)
        {
            return Bad(ex.Message, StatusCodes.Status422UnprocessableEntity);
        }
        catch (InvalidDataException ex)
        {
            return Bad(ex.Message, StatusCodes.Status422UnprocessableEntity);
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPost("merge/run")]
    public async Task Run([FromBody] MergeRunRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.MergeView);
        if (user is null)
        {
            await Denied();
            return;
        }
        if (request?.Left is null || request?.Right is null
            || request.Left.Token == Guid.Empty || request.Right.Token == Guid.Empty
            || string.IsNullOrWhiteSpace(request.Left.SheetName)
            || string.IsNullOrWhiteSpace(request.Right.SheetName)
            || request.Left.Mapping is null || request.Right.Mapping is null)
        {
            await JsonError("بيانات الربط غير صالحة. تأكد من تحديد الأعمدة بشكل صحيح.",
                StatusCodes.Status400BadRequest);
            return;
        }
        var args = new MergeRunArgs(
            request.Left.Token, request.Left.SheetName.Trim(), request.Left.Mapping,
            request.Right.Token, request.Right.SheetName.Trim(), request.Right.Mapping,
            request.IgnoreConfirmation ?? false);
        // V1 validates mappings + common rule before streaming.
        try
        {
            var leftMapping = Domain.Merge.MergeMapping.From(args.LeftMapping);
            var rightMapping = Domain.Merge.MergeMapping.From(args.RightMapping);
            if (!Domain.Merge.MergeEngine.HasCommonRule(leftMapping, rightMapping))
            {
                await JsonError("لا توجد قاعدة ربط ممكنة: يجب تحديد عمود الاسم الثلاثي (أو أعمدة الاسم واسم الأب والنسبة) أو أحد الأرقام في الجدولين.",
                    StatusCodes.Status422UnprocessableEntity);
                return;
            }
        }
        catch (ArgumentException ex)
        {
            await JsonError(ex.Message, StatusCodes.Status400BadRequest);
            return;
        }
        // Stream newline-delimited progress events + final result (V1 route).
        Response.ContentType = "application/x-ndjson";
        Response.Headers.CacheControl = "no-store";
        var ct = HttpContext.RequestAborted;
        await NdjsonWriter.StreamAsync(Response.Body, async emit =>
        {
            try
            {
                var result = merge.Run(args, (percent, detail) =>
                    NdjsonWriter.EmitSync(emit, NdjsonWriter.Progress(percent, detail)));
                await emit(NdjsonWriter.Result(SerializeResult(
                    result.SessionId, result.LeftHeaders, result.RightHeaders,
                    result.IgnoreConfirmation, result.Result)));
            }
            catch (Exception ex) when (ex is InvalidDataException || ex is KeyNotFoundException)
            {
                await emit(NdjsonWriter.Error(ex.Message));
            }
            catch (Exception)
            {
                await emit(NdjsonWriter.Error("تعذر تنفيذ الدمج."));
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

    // GET cannot carry a body (model binding never runs), so each verb has its own action.
    [HttpGet("merge/export")]
    public async Task<IActionResult> ExportGet([FromQuery] Guid sessionId, [FromQuery] string? scope = "confirmed")
    {
        var user = await RequirePermissionAsync(Permissions.MergeView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (sessionId == Guid.Empty) return Bad("معرّف الجلسة مفقود.");
        return ExportFile(sessionId, scope ?? "confirmed");
    }

    [HttpPost("merge/export")]
    public async Task<IActionResult> ExportPost([FromBody] MergeExportRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.MergeView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (request is null || request.SessionId == Guid.Empty) return Bad("معرّف الجلسة مفقود.");
        return ExportFile(request.SessionId, request.Scope ?? "confirmed");
    }

    /// <summary>Async export: streams build progress as NDJSON then a ready
    /// event with a download id. Large tables take ~60s to build, far beyond
    /// proxy idle limits, so the file is served separately via download.</summary>
    [HttpPost("merge/export/prepare")]
    public async Task PrepareExport([FromBody] MergeExportRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.MergeView);
        if (user is null)
        {
            await Denied();
            return;
        }
        if (request is null || request.SessionId == Guid.Empty)
        {
            await JsonError("معرّف الجلسة مفقود.", StatusCodes.Status400BadRequest);
            return;
        }
        if (request.Scope != null && request.Scope != "confirmed" && request.Scope != "all")
        {
            await JsonError("نوع التصدير غير صالح.", StatusCodes.Status400BadRequest);
            return;
        }
        var sessionId = request.SessionId;
        var scope = request.Scope ?? "confirmed";
        Response.ContentType = "application/x-ndjson";
        Response.Headers.CacheControl = "no-store";
        var ct = HttpContext.RequestAborted;
        await NdjsonWriter.StreamAsync(Response.Body, async emit =>
        {
            try
            {
                var ready = await merge.PrepareExportAsync(sessionId, scope,
                    (percent, detail) => NdjsonWriter.EmitSync(emit,
                        NdjsonWriter.Progress(percent, detail)), ct);
                await emit(NdjsonWriter.Ready(new
                {
                    downloadId = ready.DownloadId,
                    filename = ready.Filename,
                    size = ready.Size,
                }));
            }
            catch (Exception ex) when (ex is InvalidDataException || ex is KeyNotFoundException)
            {
                await emit(NdjsonWriter.Error(ex.Message));
            }
            catch (Exception ex)
            {
                HttpContext.RequestServices
                    .GetRequiredService<ILogger<MergeController>>()
                    .LogError(ex, "PrepareExport {SessionId} scope {Scope} failed: {ErrorType}: {ErrorMessage}",
                        sessionId, scope, ex.GetType().FullName, ex.Message);
                await emit(NdjsonWriter.Error("تعذر تصدير الملف."));
            }
        }, ct);
    }

    [HttpGet("merge/download")]
    public async Task<IActionResult> Download([FromQuery] Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.MergeView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (id == Guid.Empty) return Bad("معرّف التصدير مفقود.");
        try
        {
            var (bytes, filename, size) = merge.DownloadExport(id);
            var encoded = Uri.EscapeDataString(filename);
            Response.Headers["Content-Disposition"] =
                $"attachment; filename=\"merge.xlsx\"; filename*=UTF-8''{encoded}";
            Response.Headers["Content-Length"] = size.ToString();
            Response.Headers.CacheControl = "no-store";
            return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    private IActionResult ExportFile(Guid sessionId, string scope)
    {
        if (scope != "confirmed" && scope != "all")
            return Bad("نوع التصدير غير صالح.");
        try
        {
            var (bytes, filename) = merge.ExportScoped(sessionId, scope);
            var encoded = Uri.EscapeDataString(filename);
            Response.Headers["Content-Disposition"] =
                $"attachment; filename=\"merge.xlsx\"; filename*=UTF-8''{encoded}";
            Response.Headers["Content-Length"] = bytes.Length.ToString();
            Response.Headers.CacheControl = "no-store";
            return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    private static object SerializeResult(
        Guid sessionId, IReadOnlyList<string> leftHeaders, IReadOnlyList<string> rightHeaders,
        bool ignoreConfirmation, Domain.Merge.MergeResult result)
        => new
        {
            sessionId,
            leftHeaders,
            rightHeaders,
            ignoreConfirmation,
            left = result.Left.Select(r => new
            {
                rowNumber = r.RowNumber,
                cells = r.Cells,
                key = r.Key,
                rule = r.Rule,
                confirmed = r.Confirmed,
            }).ToList(),
            right = result.Right.Select(r => new
            {
                rowNumber = r.RowNumber,
                cells = r.Cells,
                key = r.Key,
                rule = r.Rule,
                confirmed = r.Confirmed,
            }).ToList(),
            pairs = result.Pairs.Select(p => new
            {
                key = p.Key,
                rule = p.Rule,
                leftRowNumber = p.LeftRowNumber,
                rightRowNumber = p.RightRowNumber,
                confirmed = p.Confirmed,
                leftValue = p.LeftValue,
                rightValue = p.RightValue,
            }).ToList(),
            rules = result.Rules.Select(s => new
            {
                key = s.Key,
                order = s.Order,
                label = s.Label,
                description = s.Description,
                available = s.Available,
                reason = s.Reason,
                matchedPairs = s.MatchedPairs,
                pairs = s.Pairs.Select(p => new
                {
                    key = p.Key,
                    rule = p.Rule,
                    leftRowNumber = p.LeftRowNumber,
                    rightRowNumber = p.RightRowNumber,
                    confirmed = p.Confirmed,
                    leftValue = p.LeftValue,
                    rightValue = p.RightValue,
                }).ToList(),
            }).ToList(),
            status = new
            {
                state = result.Status.State,
                matchedPairs = result.Status.MatchedPairs,
                total = result.Status.Total,
                percent = result.Status.Percent,
            },
        };
}

public record MergeDeleteKeyRequest(Guid SessionId, string Table, int RowNumber);
public record MergeSheetRequest(Guid Token, string Sheet);
public sealed record MergeRunTable(Guid Token, string SheetName, Dictionary<string, int> Mapping);
public sealed record MergeRunRequest(MergeRunTable? Left, MergeRunTable? Right, bool? IgnoreConfirmation);
public record MergeExportRequest(Guid SessionId, string? Scope = "confirmed");
