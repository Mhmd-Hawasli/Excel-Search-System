using ExcelArchive.Domain.Merge;

namespace ExcelArchive.Application.Interfaces.Storage;

public interface IMergeFileStore
{
    Guid Save(string fileName, byte[] content);
    byte[] Load(Guid token);
    void Remove(Guid token);
}

public interface IMergeSessionStore
{
    MergeSessionData Create(
        string leftSheet, List<string> leftHeaders, List<MergeRow> leftRows, MergeMapping leftMapping,
        string rightSheet, List<string> rightHeaders, List<MergeRow> rightRows, MergeMapping rightMapping,
        bool ignoreConfirmation);
    MergeSessionData Get(Guid id);
    MergeResult DeletePairKeyAndRelink(Guid sessionId, string table, int rowNumber);
}

/// <summary>Short-lived store for prepared merge export files (async
/// prepare/download flow): the build takes ~60s for large tables, far beyond
/// what reverse proxies keep idle connections open for, so the file is built
/// once with streamed progress and then served instantly by id.</summary>
public interface IMergeExportStore
{
    MergeExportData SaveExport(byte[] buffer, string filename);
    MergeExportData GetExport(Guid downloadId);
}
