using ExcelArchive.Application.DTOs.ConflictDto;
using ExcelArchive.Application.Interfaces.Excel;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>Adapter over the static ClosedXML conflict export builder.</summary>
public sealed class ConflictExportBuilderAdapter : IConflictExportBuilder
{
    public byte[] Build(IReadOnlyList<ConflictRowDto> rows, CancellationToken ct = default)
        => ConflictExportBuilder.Build(rows, ct);
}
