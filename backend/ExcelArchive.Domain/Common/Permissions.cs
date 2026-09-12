namespace ExcelArchive.Domain.Common;

/// <summary>Shared permission catalog used by services and the auth middleware.</summary>
public static class Permissions
{
    public const string UsersView = "users.view";
    public const string UsersCreate = "users.create";
    public const string UsersUpdate = "users.update";
    public const string UsersDelete = "users.delete";

    public const string BackupView = "backup.view";
    public const string BackupExport = "backup.export";
    public const string BackupRestore = "backup.restore";

    public const string ActivityView = "activity.view";
    public const string ActivityBrowse = "activity.browse";

    public const string MergeView = "merge.view";
    public const string SheetMergeView = "sheetMerge.view";

    public const string ExportView = "export.view";
    public const string ExportRun = "export.run";

    public const string EditsView = "edits.view";
    public const string EditsBadge = "edits.badge";
    public const string EditsUpdate = "edits.update";

    public const string UploadView = "upload.view";
    public const string UploadRun = "upload.run";

    public const string ConflictsView = "conflicts.view";
    public const string ConflictsFilters = "conflicts.filters";

    public const string CategoriesView = "categories.view";
    public const string CategoriesManage = "categories.manage";

    public const string GroupsView = "groups.view";
    public const string GroupsViewScoped = "groups.viewScoped";
    public const string GroupsCreate = "groups.create";
    public const string GroupsUpdate = "groups.update";

    // Architecture-only extras (not part of the 24 canonical V1 keys).
    // groups.manage was introduced during the ASP.NET split; search.view is a
    // legacy alias resolved at check time, not a stored global grant.
    public const string GroupsManage = "groups.manage";
    public const string SearchView = "search.view";

    /// <summary>26 canonical V1 keys in ten groups (docs/07.2 + groups create/update).</summary>
    public static readonly string[] Canonical = [UsersView, UsersCreate, UsersUpdate, UsersDelete,
        BackupView, BackupExport, BackupRestore, ActivityView, ActivityBrowse,
        MergeView, SheetMergeView, ExportView, ExportRun, EditsView, EditsBadge, EditsUpdate,
        UploadView, UploadRun, ConflictsView, ConflictsFilters, CategoriesView, CategoriesManage,
        GroupsView, GroupsViewScoped, GroupsCreate, GroupsUpdate];

    /// <summary>Global owner grants: canonical minus the scoped key.</summary>
    public static readonly string[] OwnerGlobals = Canonical.Where(k => k != GroupsViewScoped).ToArray();

    public static readonly string[] All = Canonical;
}
