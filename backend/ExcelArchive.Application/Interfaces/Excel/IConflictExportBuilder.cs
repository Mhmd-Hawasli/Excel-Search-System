using ExcelArchive.Application.DTOs.ConflictDto;

namespace ExcelArchive.Application.Interfaces.Excel;

/// <summary>Builds the conflicts XLSX export. Stateless.</summary>
public interface IConflictExportBuilder
{
    byte[] Build(IReadOnlyList<ConflictRowDto> rows, CancellationToken ct = default);
}
