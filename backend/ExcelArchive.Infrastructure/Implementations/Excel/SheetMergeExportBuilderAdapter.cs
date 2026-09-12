using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Domain.SheetMerge;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>Adapter over the static ClosedXML sheet-merge export builder.</summary>
public sealed class SheetMergeExportBuilderAdapter : ISheetMergeExportBuilder
{
    public byte[] Build(
        SheetMergeEngine.Built built,
        Action<int, string?>? onProgress = null, CancellationToken ct = default)
        => SheetMergeExportBuilder.Build(built, onProgress, ct);
}
