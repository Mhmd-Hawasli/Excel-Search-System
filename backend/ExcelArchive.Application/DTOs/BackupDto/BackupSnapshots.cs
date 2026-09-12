using ExcelArchive.Domain.Entities;
using FileEntity = ExcelArchive.Domain.Entities.File;

namespace ExcelArchive.Application.DTOs.BackupDto;

/// <summary>Full archive read for export (ordered entity lists).</summary>
public sealed record BackupSnapshot(
    IReadOnlyList<Domain.Entities.Group> Groups,
    IReadOnlyList<Category> Categories,
    IReadOnlyList<FileEntity> Files,
    IReadOnlyList<FileColumn> Columns,
    IReadOnlyList<Record> Records,
    IReadOnlyList<DataQualityIssue> Issues,
    IReadOnlyList<MappingTemplate> Templates,
    IReadOnlyList<UploadJob> Jobs,
    IReadOnlyList<ActivityLog> Logs,
    IReadOnlyList<RecordEdit> Edits);

/// <summary>Accounts transfer read for export.</summary>
public sealed record AccountsSnapshot(
    IReadOnlyList<User> Users,
    IReadOnlyList<UserPermission> Permissions,
    IReadOnlyList<IgnoredConflict> Ignores);

/// <summary>Accounts import insertion counts.</summary>
public sealed record AccountsImportResult(int Users, int Permissions, int Ignores);
