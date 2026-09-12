using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.DTOs.DashboardDto;
using ExcelArchive.Application.DTOs.GroupDto;
using ExcelArchive.Domain.Common;

namespace ExcelArchive.Application.Services;

/// <summary>Scoped dashboard read: three counts + latest five visible files with
/// group, row/column counts, version/date and permitted edited badge (V1 page.tsx).</summary>
public class DashboardService(IUnitOfWork uow, IAuthService auth) : IDashboardService
{
    public async Task<DashboardDto> GetAsync(CurrentUserDto user, CancellationToken ct = default)
    {
        var scope = await auth.ResolveDataScope(user, ct);

        var groupCount = scope.GroupIds is null
            ? await uow.Groups.CountAsync(ct: ct)
            : await uow.Groups.CountAsync(g => scope.GroupIds.Contains(g.Id), ct);
        var fileCount = scope.FileIds is null
            ? await uow.Files.CountAsync(ct: ct)
            : await uow.Files.CountAsync(f => scope.FileIds.Contains(f.Id), ct);
        var recordCount = scope.FileIds is null
            ? await uow.Records.CountAsync(ct: ct)
            : await uow.Records.CountAsync(r => scope.FileIds.Contains(r.FileId), ct);

        var recent = await uow.Files.ListRecentAsync(scope.FileIds, 5, ct);

        var edited = new HashSet<Guid>();
        if (recent.Count > 0 && auth.HasPermission(user, Permissions.EditsBadge))
        {
            var ids = recent.Select(f => f.Id).ToList();
            edited = (await uow.RecordEdits.EditedFileIdsAsync(ids, ct)).ToHashSet();
        }

        return new DashboardDto(groupCount, fileCount, recordCount,
            recent.Select(f => new GroupFileDto(
                f.Id, f.GroupId, f.Name, f.Description, f.OriginalFilename,
                f.RowCount, f.Columns.Count, f.Version, f.UploadedAt,
                f.Group.Name, edited.Contains(f.Id))).ToList());
    }
}
