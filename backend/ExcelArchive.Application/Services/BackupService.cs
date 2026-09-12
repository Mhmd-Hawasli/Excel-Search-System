using System.Text.Json;
using ExcelArchive.Application.Common;
using ExcelArchive.Application.Common.Backup;
using ExcelArchive.Application.DTOs.BackupDto;
using ExcelArchive.Application.Interfaces;
using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Common;
using ExcelArchive.Domain.Conflicts;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Domain.Text;
using ExcelArchive.Application.Interfaces.Services;
using FileEntity = ExcelArchive.Domain.Entities.File;

namespace ExcelArchive.Application.Services;

/// <summary>V1 archive backup parity (docs/07.9): schemaVersion/exportedAt/
/// application/data envelope with the ten archive arrays, bigint JSON strings,
/// historical national/category/job/org transforms, nonterminal jobs failed,
/// archive-only transactional replacement (users/permission accounts are a
/// separate protected transfer, never truncated here).</summary>
public class BackupService(IBackupRepository backups, IUnitOfWork uow, IActivityService activity) : IBackupService
{
    private static readonly JsonSerializerOptions CamelCase = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.Never,
    };

    public async Task<byte[]> ExportAsync(CancellationToken ct = default)
    {
        var snap = await backups.ReadArchiveAsync(ct);
        var (groups, categories, files, columns, records, issues, templates, jobs, logs, edits) = (
            snap.Groups, snap.Categories, snap.Files, snap.Columns, snap.Records,
            snap.Issues, snap.Templates, snap.Jobs, snap.Logs, snap.Edits);

        var payload = new
        {
            schemaVersion = BackupProtocol.SupportedVersion,
            exportedAt = DateTime.UtcNow,
            application = BackupProtocol.ApplicationName,
            data = new
            {
                groups = groups.Select(g => new
                {
                    id = g.Id, name = g.Name, description = g.Description,
                    sortOrder = g.SortOrder, createdAt = g.CreatedAt, updatedAt = g.UpdatedAt,
                }).ToList(),
                categories = categories.Select(c => new
                {
                    id = c.Id, name = c.Name, sortOrder = c.SortOrder, createdAt = c.CreatedAt,
                }).ToList(),
                files = files.Select(f => new
                {
                    id = f.Id, groupId = f.GroupId, name = f.Name, description = f.Description,
                    originalFilename = f.OriginalFilename, sheetName = f.SheetName, rowCount = f.RowCount,
                    columnSignature = f.ColumnSignature, version = f.Version,
                    uploadedAt = f.UploadedAt, updatedAt = f.UpdatedAt,
                }).ToList(),
                fileColumns = columns.Select(c => new
                {
                    id = c.Id, fileId = c.FileId, headerRaw = c.HeaderRaw,
                    headerNormalized = c.HeaderNormalized, columnIndex = c.ColumnIndex,
                    sortOrder = c.SortOrder, categoryId = c.CategoryId,
                    standardField = c.StandardField is null ? null : ClientEnums.ClientEnumName(c.StandardField.Value),
                    createdAt = c.CreatedAt,
                }).ToList(),
                records = records.Select(r => new
                {
                    id = r.Id, fileId = r.FileId, rowIndex = r.RowIndex, data = r.Data,
                    sfFirstName = r.SfFirstName, sfFatherName = r.SfFatherName,
                    sfLastName = r.SfLastName, sfFullName = r.SfFullName,
                    sfNationalId = r.SfNationalId?.ToString(), sfShamCash = r.SfShamCash?.ToString(),
                    sfPersonalNo = r.SfPersonalNo, sfMotherName = r.SfMotherName, sfPhone = r.SfPhone,
                    sfContractCode = r.SfContractCode, sfSecondaryContractCode = r.SfSecondaryContractCode,
                    sfJobTitle = r.SfJobTitle, sfFunctionalCategory = r.SfFunctionalCategory,
                    sfOrganizationalLevel = r.SfOrganizationalLevel,
                    nFirstName = r.NFirstName, nFatherName = r.NFatherName, nLastName = r.NLastName,
                    nFullName = r.NFullName, nMotherName = r.NMotherName, nContractCode = r.NContractCode,
                    nSecondaryContractCode = r.NSecondaryContractCode, nJobTitle = r.NJobTitle,
                    nOrganizationalLevel = r.NOrganizationalLevel,
                    dNationalId = r.DNationalId, dPersonalNo = r.DPersonalNo, dPhone = r.DPhone,
                    nationalIdNum = r.NationalIdNum?.ToString(),
                    fmtFills = r.FmtFills, fmtFontColors = r.FmtFontColors,
                    createdAt = r.CreatedAt,
                }).ToList(),
                dataQualityIssues = issues.Select(i => new
                {
                    id = i.Id, fileId = i.FileId, rowIndex = i.RowIndex,
                    issueType = ClientEnums.ClientEnumName(i.IssueType),
                    columnName = i.ColumnName, rawValue = i.RawValue, createdAt = i.CreatedAt,
                }).ToList(),
                mappingTemplates = templates.Select(t => new
                {
                    id = t.Id, groupId = t.GroupId, name = t.Name,
                    headerSignature = t.HeaderSignature, mapping = t.Mapping,
                    createdAt = t.CreatedAt, updatedAt = t.UpdatedAt,
                }).ToList(),
                uploadJobs = jobs.Select(j => new
                {
                    id = j.Id, fileId = j.FileId, status = ClientEnums.ClientEnumName(j.Status),
                    totalRows = j.TotalRows, processedRows = j.ProcessedRows,
                    errorMessage = j.ErrorMessage, payload = j.Payload,
                    startedAt = j.StartedAt, finishedAt = j.FinishedAt,
                }).ToList(),
                activityLogs = logs.Select(a => new
                {
                    id = a.Id, action = ClientEnums.ClientEnumName(a.Action),
                    targetName = a.TargetName, details = a.Details, createdAt = a.CreatedAt,
                }).ToList(),
                recordEdits = edits.Select(e => new
                {
                    id = e.Id, recordId = e.RecordId, fileId = e.FileId, fileColumnId = e.FileColumnId,
                    headerRaw = e.HeaderRaw, oldValue = e.OldValue, newValue = e.NewValue,
                    createdAt = e.CreatedAt,
                }).ToList(),
            },
        };
        return JsonSerializer.SerializeToUtf8Bytes(payload, CamelCase);
    }

    public async Task<IReadOnlyDictionary<string, int>> RestoreAsync(Stream jsonStream, string actorUsername, CancellationToken ct = default)
    {
        JsonDocument document;
        try
        {
            document = await JsonDocument.ParseAsync(jsonStream, cancellationToken: ct);
        }
        catch (JsonException) { throw new InvalidOperationException("ملف النسخة غير صالح (JSON تالف)."); }
        using (document)
        {
            // Validate the complete envelope and every row BEFORE touching the
            // live database: malformed input leaves all data unchanged.
            var plan = ArchivePlan.Parse(document.RootElement);
            await backups.ReplaceArchiveAsync(plan, ct);
            await backups.InvalidateConflictCacheAsync(ct);
            await activity.WriteAsync(ActivityAction.BackupRestored, "النسخة الاحتياطية", new { by = actorUsername }, ct);
            return new Dictionary<string, int>
            {
                ["groups"] = plan.Groups.Count,
                ["files"] = plan.Files.Count,
                ["records"] = plan.Records.Count,
            };
        }
    }

    public async Task<byte[]> ExportAccountsAsync(CancellationToken ct = default)
    {
        var accounts = await backups.ReadAccountsAsync(ct);
        var (users, permissions, ignores) = (accounts.Users, accounts.Permissions, accounts.Ignores);
        var payload = new
        {
            schemaVersion = BackupProtocol.SupportedVersion,
            exportedAt = DateTime.UtcNow,
            application = BackupProtocol.AccountsApplicationName,
            data = new
            {
                users = users.Select(u => new
                {
                    id = u.Id, username = u.Username, passwordHash = u.PasswordHash,
                    displayName = u.DisplayName, isActive = u.IsActive,
                    createdAt = u.CreatedAt, updatedAt = u.UpdatedAt,
                }).ToList(),
                userPermissions = permissions.Select(p => new
                {
                    id = p.Id, userId = p.UserId, permission = p.Permission,
                    groupId = p.GroupId, fileId = p.FileId, createdAt = p.CreatedAt,
                }).ToList(),
                ignoredConflicts = ignores.Select(i => new
                {
                    id = i.Id, rule = i.Rule, recordId = i.RecordId, createdAt = i.CreatedAt,
                }).ToList(),
            },
        };
        return JsonSerializer.SerializeToUtf8Bytes(payload, CamelCase);
    }

    public async Task<IReadOnlyDictionary<string, int>> ImportAccountsAsync(Stream jsonStream, string actorUsername, CancellationToken ct = default)
    {
        JsonDocument document;
        try
        {
            document = await JsonDocument.ParseAsync(jsonStream, cancellationToken: ct);
        }
        catch (JsonException) { throw new InvalidOperationException("ملف الترحيل غير صالح (JSON تالف)."); }
        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("schemaVersion", out var ver) || ver.ValueKind != JsonValueKind.Number
                || !ver.TryGetInt32(out var version) || version != BackupProtocol.SupportedVersion
                || !root.TryGetProperty("application", out var app) || app.ValueKind != JsonValueKind.String
                || app.GetString() != BackupProtocol.AccountsApplicationName
                || !root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object)
                throw new InvalidOperationException("ملف الترحيل غير صالح أو غير متوافق.");

            var users = ArchivePlan.Rows(data, "users").Select(ParseAccountUser).ToList();
            var permissions = ArchivePlan.Rows(data, "userPermissions").Select(ParseAccountPermission).ToList();
            var ignores = ArchivePlan.Rows(data, "ignoredConflicts").Select(ParseAccountIgnore).ToList();

            // All-or-nothing validation before any write.
            if (users.GroupBy(u => u.Id).Any(g => g.Count() > 1)
                || users.GroupBy(u => u.Username).Any(g => g.Count() > 1))
                throw new InvalidOperationException("ملف الترحيل غير صالح أو غير متوافق.");
            var userIds = new HashSet<Guid>(users.Select(u => u.Id));
            var existingUserIds = new HashSet<Guid>(await uow.Users.AllIdsAsync(ct));
            var usernames = users.Select(u => u.Username).ToList();
            var existingUsernames = new HashSet<string>(await uow.Users.AllUsernamesAsync(ct));
            var colliding = users.FirstOrDefault(u =>
                existingUserIds.Contains(u.Id) || existingUsernames.Contains(u.Username));
            if (colliding is not null)
                throw new ConflictException($"يتعارض حساب «{colliding.Username}» مع حساب موجود. راجع الحسابات قبل إعادة الاستيراد.");
            var knownUserIds = new HashSet<Guid>(await uow.Users.AllIdsAsync(ct));
            knownUserIds.UnionWith(userIds);
            if (permissions.Any(p => !knownUserIds.Contains(p.UserId)))
                throw new InvalidOperationException("ملف الترحيل غير صالح أو غير متوافق.");
            var groupIds = new HashSet<Guid>(await uow.Groups.AllIdsAsync(ct));
            var fileIds = new HashSet<Guid>(await uow.Files.AllFileIdsAsync(ct));
            if (permissions.Any(p =>
                    (p.GroupId is not null && !groupIds.Contains(p.GroupId.Value))
                    || (p.FileId is not null && !fileIds.Contains(p.FileId.Value))))
                throw new InvalidOperationException("إحدى المجموعات أو الملفات المرجعية في الترحيل غير موجودة في الأرشيف المستهدف.");
            var recordIds = new HashSet<Guid>(await uow.Records.AllIdsAsync(ct));
            if (ignores.Any(i => !recordIds.Contains(i.RecordId)))
                throw new InvalidOperationException("إحدى السجلات المرجعية في الترحيل غير موجودة في الأرشيف المستهدف.");

            var permEntities = permissions.Select(p => new UserPermission
            {
                Id = p.Id, UserId = p.UserId, Permission = p.Permission,
                GroupId = p.GroupId, FileId = p.FileId, CreatedAt = p.CreatedAt,
            }).ToList();
            var ignoreEntities = ignores.Select(i => new IgnoredConflict
            {
                Id = i.Id, Rule = i.Rule, RecordId = i.RecordId, CreatedAt = i.CreatedAt,
            }).ToList();
            AccountsImportResult inserted;
            try
            {
                inserted = await backups.ImportAccountsAsync(users, permEntities, ignoreEntities, ct);
            }
            catch (Exception ex) when (ex is not (ConflictException or InvalidOperationException or InvalidDataException))
            {
                throw new InvalidOperationException("فشل الاستيراد وتم التراجع عن كل التغييرات.");
            }
            await activity.WriteAsync(ActivityAction.BackupRestored, "استيراد الحسابات والصلاحيات",
                new { by = actorUsername, users = inserted.Users, permissions = inserted.Permissions, ignores = inserted.Ignores }, ct);
            return new Dictionary<string, int>
            {
                ["users"] = inserted.Users,
                ["userPermissions"] = inserted.Permissions,
                ["ignoredConflicts"] = inserted.Ignores,
            };
        }

        static User ParseAccountUser(JsonElement el) => new()
        {
            Id = ArchivePlan.Uuid(el, "id"),
            Username = ArchivePlan.ReqText(el, "username"),
            PasswordHash = ArchivePlan.ReqText(el, "passwordHash"),
            DisplayName = ArchivePlan.OptText(el, "displayName"),
            IsActive = el.TryGetProperty("isActive", out var active) && active.ValueKind == JsonValueKind.True,
            CreatedAt = ArchivePlan.ReqDate(el, "createdAt"),
            UpdatedAt = el.TryGetProperty("updatedAt", out var updated) && updated.ValueKind == JsonValueKind.String
                && DateTime.TryParse(updated.GetString(), out var date)
                ? DateTime.SpecifyKind(date, DateTimeKind.Utc) : ArchivePlan.ReqDate(el, "createdAt"),
        };

        static (Guid Id, Guid UserId, string Permission, Guid? GroupId, Guid? FileId, DateTime CreatedAt)
            ParseAccountPermission(JsonElement el)
        {
            var permission = ArchivePlan.ReqText(el, "permission");
            var known = Permissions.Canonical.Contains(permission)
                || permission is "files.viewScoped" or "search.view" or "search.scoped";
            if (!known) throw new InvalidDataException("صلاحية غير معروفة.");
            return (ArchivePlan.Uuid(el, "id"), ArchivePlan.Uuid(el, "userId"), permission,
                ArchivePlan.OptUuid(el, "groupId"), ArchivePlan.OptUuid(el, "fileId"), ArchivePlan.ReqDate(el, "createdAt"));
        }

        static (Guid Id, string Rule, Guid RecordId, DateTime CreatedAt) ParseAccountIgnore(JsonElement el)
        {
            var rule = ArchivePlan.ReqText(el, "rule");
            if (!Domain.Conflicts.ConflictCatalog.ByKey.ContainsKey(rule))
                throw new InvalidDataException("قاعدة تجاهل غير معروفة.");
            return (ArchivePlan.Uuid(el, "id"), rule, ArchivePlan.Uuid(el, "recordId"), ArchivePlan.ReqDate(el, "createdAt"));
        }
    }
}
