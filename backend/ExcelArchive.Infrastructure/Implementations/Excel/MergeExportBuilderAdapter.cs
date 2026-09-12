using ExcelArchive.Application.DTOs.MergeDto;
using ExcelArchive.Application.Interfaces.Excel;
using ExcelArchive.Domain.Merge;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>Adapter over the static ClosedXML merge export builder.</summary>
public sealed class MergeExportBuilderAdapter : IMergeExportBuilder
{
    public byte[] Build(
        IReadOnlyList<string> leftHeaders, IReadOnlyList<MergeRow> left,
        IReadOnlyList<string> rightHeaders, IReadOnlyList<MergeRow> right,
        string scope = "confirmed", Action<int, string?>? onProgress = null)
        => MergeExportBuilder.Build(leftHeaders, left, rightHeaders, right, scope, onProgress);

    public string FileName(string scope, DateTime? today = null)
        => MergeExportBuilder.FileName(scope, today);
}
