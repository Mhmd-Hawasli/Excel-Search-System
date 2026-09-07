using ExcelArchive.Api.Data;
using ExcelArchive.Api.DTOs.Edits;
using ExcelArchive.Api.Services;
using ExcelArchive.Api.Services.Abstractions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Api.Controllers;

public class RecordsController(AppDbContext db, IEditsService edits, IAuthService auth) : ApiControllerBase(auth)
{
    [HttpGet("records/{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.GroupsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        var scope = await auth.ResolveDataScope(user);
        var record = await db.Records.AsNoTracking()
            .Include(r => r.File).ThenInclude(f => f.Group)
            .Include(r => r.Edits.OrderBy(e => e.CreatedAt))
            .FirstOrDefaultAsync(r => r.Id == id);
        if (record is null) return HiddenNotFound();
        if (scope.FileIds is not null && !scope.FileIds.Contains(record.FileId)) return HiddenNotFound();
        return Ok(new
        {
            id = record.Id,
            fileId = record.FileId,
            fileName = record.File.Name,
            groupId = record.File.GroupId,
            groupName = record.File.Group.Name,
            rowIndex = record.RowIndex,
            data = record.Data.RootElement,
            edits = record.Edits.Select(e => new EditDto(e.Id, e.RecordId, e.FileId, e.FileColumnId, e.HeaderRaw, e.OldValue, e.NewValue, e.CreatedAt)).ToList(),
        });
    }

    [HttpPost("records/{id:guid}/visit")]
    public async Task<IActionResult> Visit(Guid id)
    {
        var user = await RequirePermissionAsync(Permissions.GroupsView);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            await edits.VisitAsync(id, user.Username);
            return Ok(new { ok = true });
        }
        catch (Exception ex) { return HandleError(ex); }
    }

    [HttpPost("records/{id:guid}/edits/revert")]
    public async Task<IActionResult> Revert(Guid id, [FromBody] RevertEditRequest request)
    {
        var user = await RequirePermissionAsync(Permissions.EditsUpdate);
        if (user is null) return IsAuthenticated ? HiddenNotFound() : UnauthorizedSession();
        try
        {
            await edits.RevertAsync(request.EditId, request.NewValue, user.Username);
            return Ok(new { ok = true });
        }
        catch (Exception ex) { return HandleError(ex); }
    }
}
