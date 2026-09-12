namespace ExcelArchive.Domain.Merge;

/// <summary>Prepared two-file merge export buffer (short-lived, in-memory).</summary>
public sealed record MergeExportData(
    Guid Id, DateTime CreatedAt, byte[] Buffer, string Filename);
