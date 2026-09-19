namespace ExcelArchive.Application.Interfaces.Storage;

/// <summary>
/// Isolated temp storage for bulk-search uploads (البحث الجماعي).
/// Same lifecycle as the merge file store: UUID tokens, bounded entries,
/// hours-long TTL. Never touches archive records.
/// </summary>
public interface IBulkSearchFileStore
{
    Guid Save(string fileName, byte[] content);
    byte[] Load(Guid token);
    void Remove(Guid token);
}
