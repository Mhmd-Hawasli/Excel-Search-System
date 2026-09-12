using ExcelArchive.Application.DTOs.UploadDto;
using ExcelArchive.Application.Interfaces.Excel;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>Adapter over the static header-engine validation (no static state crosses layers).</summary>
public sealed class HeaderMappingValidatorAdapter : IHeaderMappingValidator
{
    public string? LinkedMappingError(
        string sheetName,
        int sheetIndex,
        IReadOnlyList<string>? supplementalNames,
        int nationalIdColumnIndex,
        IReadOnlyList<InspectedColumn> columns)
        => HeaderEngine.LinkedMappingError(sheetName, sheetIndex, supplementalNames, nationalIdColumnIndex, columns);
}
