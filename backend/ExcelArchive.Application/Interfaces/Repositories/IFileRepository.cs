using FileEntity = ExcelArchive.Domain.Entities.File;
using ExcelArchive.Domain.Repositories;

namespace ExcelArchive.Application.Interfaces.Repositories;

public interface IFileRepository : IRepositoryBase<FileEntity>
{
    Task<bool> NameExistsAsync(string name, CancellationToken ct = default);
    Task<FileEntity?> FindWithGroupAsync(Guid id, CancellationToken ct = default);
    Task<FileEntity?> FindWithColumnsAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> FileIdsByGroupIdsAsync(IEnumerable<Guid> groupIds, CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> GroupIdsByFileIdsAsync(IEnumerable<Guid> fileIds, CancellationToken ct = default);
    Task<int> CountByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> AllFileIdsAsync(CancellationToken ct = default);
    Task<Dictionary<Guid, (int Files, long Records)>> CountByGroupAsync(IReadOnlyList<Guid>? fileIds, CancellationToken ct = default);
    Task<IReadOnlyList<FileEntity>> ListScopedAsync(IReadOnlyList<Guid>? fileIds, CancellationToken ct = default);
    Task<IReadOnlyList<FileEntity>> ListByGroupAsync(Guid groupId, IReadOnlyList<Guid>? fileIds, CancellationToken ct = default);
    Task<IReadOnlyList<FileEntity>> ListRecentAsync(IReadOnlyList<Guid>? fileIds, int take, CancellationToken ct = default);
    Task<IReadOnlyList<FileEntity>> ListWithGroupByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default);
    Task AddAsync(FileEntity file, CancellationToken ct = default);
}
