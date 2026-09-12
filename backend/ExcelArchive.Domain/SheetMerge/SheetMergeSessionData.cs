namespace ExcelArchive.Domain.SheetMerge;

/// <summary>Temporary sheet-merge session + prepared export buffer (memory only).</summary>
public sealed record SheetMergeSessionData(
    Guid Id, DateTime CreatedAt, Guid UploadId,
    int NationalIdColumn, IReadOnlyList<string> SheetNames,
    SheetMergeStats Result);

public sealed record SheetMergeExportData(
    Guid Id, DateTime CreatedAt, byte[] Buffer, string Filename, int SheetCount);
