using ExcelArchive.Application.DTOs.BackupDto;
using ExcelArchive.Domain.Entities;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IBackupRepository
{
    Task<BackupSnapshot> ReadArchiveAsync(CancellationToken ct = default);
    Task ReplaceArchiveAsync(ArchivePlan plan, CancellationToken ct = default);
    Task InvalidateConflictCacheAsync(CancellationToken ct = default);
    Task<AccountsSnapshot> ReadAccountsAsync(CancellationToken ct = default);
    Task<AccountsImportResult> ImportAccountsAsync(
        IReadOnlyList<User> users,
        IReadOnlyList<UserPermission> permissions,
        IReadOnlyList<IgnoredConflict> ignores,
        CancellationToken ct = default);
}
