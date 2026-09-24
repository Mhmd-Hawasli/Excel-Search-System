using ExcelArchive.Application.DTOs.AuthDto;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Services;
using ExcelArchive.Domain.Common;

namespace ExcelArchive.Application.Services;

/// <summary>
/// Scope resolution over repositories: global GroupsView means unrestricted
/// (null lists); otherwise scoped grants expand across the group/file graph.
/// Null vs empty list semantics are preserved end to end.
/// Private groups stay invisible to everyone except their owner and holders
/// of GroupsViewPrivate (maintenance): global viewers without that grant get
/// an explicit scope of all non-private groups plus their own private ones,
/// so every downstream consumer (search, files, records, edits, conflicts,
/// upload, move) hides foreign private data without any change.
/// </summary>
public sealed class ScopedArchiveQuery(IUnitOfWork uow) : IScopedArchiveQuery
{
    public async Task<DataScopeDto> ResolveAsync(CurrentUserDto user, CancellationToken ct = default)
    {
        var unified = AuthService.UnifyDataPermissions(user.Permissions);
        var canViewPrivate = unified.Any(p =>
            p.Permission == Permissions.GroupsViewPrivate && p.GroupId is null && p.FileId is null);
        var hasGlobal = unified.Any(p =>
            p.Permission == Permissions.GroupsView && p.GroupId is null && p.FileId is null);
        if (hasGlobal && canViewPrivate) return new DataScopeDto { GroupIds = null, FileIds = null };

        if (hasGlobal)
        {
            // Explicit allow-list: every shared group plus the caller's own
            // private groups. Foreign private groups (and their files) drop
            // out of every scope-checked surface automatically.
            var visibleGroups = (await uow.Groups.ListAsync(
                g => !g.IsPrivate || g.OwnerUserId == user.Id, ct))
                .Select(g => g.Id).ToList();
            var visibleFiles = visibleGroups.Count > 0
                ? (await uow.Files.FileIdsByGroupIdsAsync(visibleGroups, ct)).ToList()
                : new List<Guid>();
            return new DataScopeDto { GroupIds = visibleGroups, FileIds = visibleFiles };
        }

        var groups = new HashSet<Guid>();
        var files = new HashSet<Guid>();
        foreach (var row in unified.Where(p => p.Permission == Permissions.GroupsViewScoped))
        {
            if (row.GroupId is not null) groups.Add(row.GroupId.Value);
            if (row.FileId is not null) files.Add(row.FileId.Value);
        }

        // Scoped users always keep their own private groups even without an
        // explicit grant row for them (grants cannot reference a group the
        // granter cannot see, so ownership is the only path here).
        var ownPrivate = await uow.Groups.ListAsync(
            g => g.IsPrivate && g.OwnerUserId == user.Id, ct);
        foreach (var g in ownPrivate) groups.Add(g.Id);
        if (ownPrivate.Count > 0)
        {
            foreach (var id in await uow.Files.FileIdsByGroupIdsAsync(
                ownPrivate.Select(g => g.Id).ToList(), ct)) files.Add(id);
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
