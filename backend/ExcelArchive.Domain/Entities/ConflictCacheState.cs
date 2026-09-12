namespace ExcelArchive.Domain.Entities;

/// <summary>
/// Derived-data revision counter. Single row id=1; bumped by statement triggers
/// on records/files/file_columns/upload_jobs/ignored_conflicts.
/// V1: prisma ConflictCacheState (int id, BigInt revision). No Guid BaseEntity.
/// </summary>
public class ConflictCacheState
{
    public int Id { get; set; } = 1;
    public long Revision { get; set; }
}
