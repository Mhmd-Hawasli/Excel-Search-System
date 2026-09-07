namespace ExcelArchive.Api.Services;

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

    public static readonly string[] All = [UsersView, UsersCreate, UsersUpdate, UsersDelete,
        BackupView, BackupExport, BackupRestore, ActivityView, ActivityBrowse,
        MergeView, SheetMergeView, ExportView, ExportRun, EditsView, EditsBadge, EditsUpdate,
        UploadView, UploadRun, ConflictsView, ConflictsFilters, CategoriesView, CategoriesManage,
        GroupsView];
}
