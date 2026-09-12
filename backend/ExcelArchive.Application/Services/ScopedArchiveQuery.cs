using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Domain.Common;

namespace ExcelArchive.Application.Services;

/// <summary>
/// Scope resolution over repositories: global GroupsView means unrestricted
/// (null lists); otherwise scoped grants expand across the group/file graph.
/// Null vs empty list semantics are preserved end to end.
/// </summary>
public sealed class ScopedArchiveQuery(IUnitOfWork uow) : IScopedArchiveQuery
{
    public async Task<DataScopeDto> ResolveAsync(CurrentUserDto user, CancellationToken ct = default)
    {
        if (HasGlobalGroupsView(user)) return new DataScopeDto { GroupIds = null, FileIds = null };

        var groups = new HashSet<Guid>();
        var files = new HashSet<Guid>();
        foreach (var row in AuthService.UnifyDataPermissions(user.Permissions).Where(p => p.Permission == Permissions.GroupsViewScoped))
        {
            if (row.GroupId is not null) groups.Add(row.GroupId.Value);
            if (row.FileId is not null) files.Add(row.FileId.Value);
        }

        if (groups.Count > 0)
        {
            foreach (var id in await uow.Files.FileIdsByGroupIdsAsync(groups, ct)) files.Add(id);
        }

        if (files.Count > 0)
        {
            foreach (var id in await uow.Files.GroupIdsByFileIdsAsync(files, ct)) groups.Add(id);
        }

        return new DataScopeDto { GroupIds = groups.ToList(), FileIds = files.ToList() };
    }

    private static bool HasGlobalGroupsView(CurrentUserDto user)
        => AuthService.UnifyDataPermissions(user.Permissions).Any(p =>
            p.Permission == Permissions.GroupsView && p.GroupId is null && p.FileId is null);
}
