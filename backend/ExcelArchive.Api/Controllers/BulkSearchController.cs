using ExcelArchive.Api.Common.Http;
using ExcelArchive.Application.Common;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.BulkSearchDto;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Domain.Text;
using Microsoft.AspNetCore.Mvc;

namespace ExcelArchive.Api.Controllers;

/// <summary>
/// Bulk search (البحث الجماعي): isolated Excel upload, per-value archive
/// search in custom mode over one reference field, high-match (≥80%) export
/// streamed back directly without any server-side persistence.
/// </summary>
public class BulkSearchController(IAuthService auth, IBulkSearchService bulk) : ApiControllerBase(auth)
{
    [HttpPost("bulk-search/inspect")]
    [RequestSizeLimit(50 * 1024 * 1024)]
    public async Task<IActionResult> Inspect(IFormFile? file)
    {
        var user = await RequirePermissionAsync(Permissions.BulkSearchView);
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
            var inspection = bulk.Inspect(ms.ToArray(), file.FileName);
            return Ok(ApiResponse.Success(SerializeInspection(inspection)));
        }
        catch (InvalidDataException ex)
        {
            return Bad(ex.Message, StatusCodes.Status422UnprocessableEntity);
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPost("bulk-search/sheet")]
    public async Task<IActionResult> Sheet([FromBody] BulkSearchSheetRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.BulkSearchView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        if (request is null || request.Token == Guid.Empty || string.IsNullOrWhiteSpace(request.Sheet))
            return Bad("بيانات غير صالحة.");
        try
        {
            var selected = bulk.InspectSheet(request.Token, request.Sheet.Trim());
            return Ok(ApiResponse.Success(SerializeSheet(selected)));
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

    [HttpPost("bulk-search/run")]
    public async Task Run([FromBody] BulkSearchRunRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.BulkSearchView);
        if (user is null)
        {
            await Denied();
            return;
        }
        if (!TryBuildArgs(request, out var args, out var error))
        {
            await JsonError(error!, StatusCodes.Status400BadRequest);
            return;
        }
        var scope = await Auth.ResolveDataScope(user);
        var scoped = ApplySearchScope(
            ParseUuids(request!.GroupIds, out var groupsValid),
            ParseUuids(request!.FileIds, out var filesValid), scope);
        if (!groupsValid || !filesValid)
        {
            await JsonError("معايير البحث غير صالحة.", StatusCodes.Status400BadRequest);
            return;
        }
        Response.ContentType = "application/x-ndjson";
        Response.Headers.CacheControl = "no-store";
        var ct = HttpContext.RequestAborted;
        await NdjsonWriter.StreamAsync(Response.Body, async emit =>
        {
            try
            {
                BulkSearchResult result;
                if (scoped is null)
                {
                    result = new BulkSearchResult(args!.Field, 0, 0, 0, [], [], 0, false);
                }
                else
                {
                    result = await bulk.RunAsync(args!,
                        scoped.Groups, scoped.Files, scoped.Allowed,
                        (percent, detail) => NdjsonWriter.EmitSync(emit,
                            NdjsonWriter.Progress(percent, detail)), ct);
                }
                await emit(NdjsonWriter.Result(SerializeResult(result)));
            }
            catch (OperationCanceledException)
            {
                // The user stopped the operation: the connection is gone,
                // nothing left to report.
            }
            catch (Exception ex) when (ex is InvalidDataException || ex is KeyNotFoundException)
            {
                await emit(NdjsonWriter.Error(ex.Message));
            }
            catch (Exception)
            {
                await emit(NdjsonWriter.Error("تعذر تنفيذ البحث الجماعي."));
            }
        }, ct);
    }

    /// <summary>
    /// Direct workbook download: the client sends back the run's result rows
    /// plus the run's unmatched values, and the workbook lists every searched
    /// value in sequence order — matches repeated per archive row, unmatched
    /// values as rows with empty file/row/match cells. The search is never
    /// re-run and nothing is stored on the server.
    /// </summary>
    [HttpPost("bulk-search/export")]
    public async Task<IActionResult> Export([FromBody] BulkSearchExportRequest? request)
    {
        var user = await RequirePermissionAsync(Permissions.BulkSearchView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            var rows = new List<BulkSearchRow>(request?.Rows?.Count ?? 0);
            string? exportField = null;
            if (request?.Rows is not null)
            {
                foreach (var item in request.Rows)
                {
                    var field = (item?.Field ?? "").Trim().ToLowerInvariant();
                    if (item is null || item.Sequence < 1 || item.RowIndex < 0
                        || string.IsNullOrWhiteSpace(item.QueryValue)
                        || !BulkSearchMatch.IsSupportedField(field))
                        return Bad("بيانات التصدير غير صالحة.");
                    exportField ??= field;
                    rows.Add(new BulkSearchRow(
                        item.Sequence, item.QueryValue.Trim(), field,
                        "", item.FileName ?? "", item.RowIndex,
                        item.FullName, item.NationalId, item.ShamCash, item.PersonalNo,
                        Math.Clamp(item.MatchPercent, 0, 100)));
                }
            }
            var unmatched = new List<BulkSearchUnmatched>(request?.Unmatched?.Count ?? 0);
            if (request?.Unmatched is not null)
            {
                foreach (var item in request.Unmatched)
                {
                    var field = (item?.Field ?? "").Trim().ToLowerInvariant();
                    if (item is null || item.Sequence < 1
                        || string.IsNullOrWhiteSpace(item.QueryValue)
                        || !BulkSearchMatch.IsSupportedField(field))
                        return Bad("بيانات التصدير غير صالحة.");
                    exportField ??= field;
                    unmatched.Add(new BulkSearchUnmatched(item.Sequence, item.QueryValue.Trim()));
                }
            }
            if (rows.Count == 0 && unmatched.Count == 0)
                return Bad("لا توجد نتائج للتصدير.");
            rows = rows
                .OrderBy(r => r.Sequence)
                .ThenByDescending(r => r.MatchPercent)
                .ToList();
            // A sequence is either matched or unmatched: ignore unmatched
            // entries duplicating a matched sequence.
            var matchedSequences = new HashSet<int>(rows.Select(r => r.Sequence));
            var effectiveUnmatched = unmatched
                .Where(u => !matchedSequences.Contains(u.Sequence))
                .OrderBy(u => u.Sequence)
                .ToList();
            var bytes = Infrastructure.Implementations.Excel.BulkSearchExportBuilder.Build(
                rows, exportField!, effectiveUnmatched);
            var filename = Infrastructure.Implementations.Excel.BulkSearchExportBuilder.FileName();
            var encoded = Uri.EscapeDataString(filename);
            Response.Headers["Content-Disposition"] =
                $"attachment; filename=\"bulk-search.xlsx\"; filename*=UTF-8''{encoded}";
            Response.Headers["Content-Length"] = bytes.Length.ToString();
            Response.Headers.CacheControl = "no-store";
            return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    private static bool TryBuildArgs(
        BulkSearchRunRequest? request, out BulkSearchRunArgs? args, out string? error)
    {
        args = null;
        error = null;
        if (request is null || request.Token == Guid.Empty
            || string.IsNullOrWhiteSpace(request.SheetName)
            || string.IsNullOrWhiteSpace(request.Field)
            || request.Column < 0)
        {
            error = "بيانات البحث الجماعي غير صالحة. تأكد من تحديد الورقة والعمود المرجعي وعمود الاكسيل.";
            return false;
        }
        var field = request.Field.Trim().ToLowerInvariant();
        if (!BulkSearchMatch.IsSupportedField(field))
        {
            error = "اختر العمود المرجعي من البيانات المحفوظة في النظام.";
            return false;
        }
        args = new BulkSearchRunArgs(
            request.Token, request.SheetName.Trim(), field, request.Column);
        return true;
    }

    private static object SerializeInspection(BulkSearchInspection inspection) => new
    {
        token = inspection.Token,
        originalFilename = inspection.OriginalFilename,
        sheets = inspection.Sheets.Select(s => new { name = s.Name, rowCount = s.RowCount }).ToList(),
        selected = SerializeSheet(inspection.Selected),
    };

    private static object SerializeSheet(BulkSearchSelectedSheet selected) => new
    {
        sheetName = selected.SheetName,
        headers = selected.Headers,
        preview = selected.Preview,
        rowCount = selected.RowCount,
        columnCount = selected.ColumnCount,
    };

    private static object SerializeResult(BulkSearchResult result) => new
    {
        field = result.Field,
        totalValues = result.TotalValues,
        matchedValues = result.MatchedValues,
        unmatchedValues = result.UnmatchedValues,
        unmatchedQueries = result.UnmatchedQueries
            .Select(u => new { sequence = u.Sequence, query = u.Query })
            .ToList(),
        totalMatches = result.TotalMatches,
        truncated = result.Truncated,
        rows = result.Rows.Select(r => new
        {
            sequence = r.Sequence,
            queryValue = r.QueryValue,
            field = r.Field,
            groupName = r.GroupName,
            fileName = r.FileName,
            rowIndex = r.RowIndex,
            fullName = r.FullName,
            nationalId = r.NationalId,
            shamCash = r.ShamCash,
            personalNo = r.PersonalNo,
            matchPercent = r.MatchPercent,
        }).ToList(),
    };

    private static List<Guid> ParseUuids(List<string>? values, out bool valid)
    {
        valid = true;
        var result = new List<Guid>();
        var seen = new HashSet<Guid>();
        foreach (var raw in values ?? [])
        {
            if (!Guid.TryParse(raw?.Trim(), out var id)) { valid = false; return []; }
            if (seen.Add(id)) result.Add(id);
        }
        return result;
    }

    /// <summary>Intersects requested filters with the authorized scope (V1 scope.ts).
    /// Null means nothing is searchable: callers render an empty result.</summary>
    private sealed record ScopedFilters(List<Guid> Groups, List<Guid> Files, List<Guid>? Allowed);

    private static ScopedFilters? ApplySearchScope(
        List<Guid> requestedGroups, List<Guid> requestedFiles, DataScopeDto scope)
    {
        if (scope.GroupIds is null) return new ScopedFilters(requestedGroups, requestedFiles, null);
        var allowedGroups = new HashSet<Guid>(scope.GroupIds);
        var allowedFiles = new HashSet<Guid>(scope.FileIds ?? []);
        var groups = requestedGroups.Count > 0
            ? requestedGroups.Where(allowedGroups.Contains).ToList()
            : requestedFiles.Count > 0 ? [] : allowedGroups.ToList();
        var files = requestedFiles.Count > 0
            ? requestedFiles.Where(allowedFiles.Contains).ToList()
            : requestedGroups.Count > 0 ? [] : allowedFiles.ToList();
        if (groups.Count == 0 && files.Count == 0) return null;
        return new ScopedFilters(groups, files, allowedFiles.ToList());
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
}

public record BulkSearchSheetRequest(Guid Token, string Sheet);

public sealed record BulkSearchRunRequest(
    Guid Token, string SheetName, string Field, int Column,
    List<string>? GroupIds = null, List<string>? FileIds = null);
