using System.IO.Compression;
using System.Text.Json;
using ExcelArchive.Application.DTOs.ExcelDto;

namespace ExcelArchive.Application.Services;

/// <summary>Lossless version export state, kept in the same DB transaction as
/// the version change. Cell diffs alone cannot reconstruct deleted rows or
/// columns, so historical exports always read this snapshot.</summary>
public static class VersionSnapshotCodec
{
    public static byte[] Encode(FileExportDataDto data)
    {
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.Fastest, leaveOpen: true))
            JsonSerializer.Serialize(gzip, data);
        return output.ToArray();
    }

    public static FileExportDataDto Decode(byte[] compressed)
    {
        using var input = new MemoryStream(compressed);
        using var gzip = new GZipStream(input, CompressionMode.Decompress);
        return JsonSerializer.Deserialize<FileExportDataDto>(gzip)
            ?? throw new InvalidDataException("نسخة الإصدار المحفوظة غير صالحة.");
    }
}
