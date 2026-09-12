using ExcelArchive.Application.DTOs.UploadDto;

namespace ExcelArchive.Application.Interfaces.Excel;

/// <summary>Linked-sheets mapping validation. Stateless.</summary>
public interface IHeaderMappingValidator
{
    string? LinkedMappingError(
        string sheetName,
        int sheetIndex,
        IReadOnlyList<string>? supplementalNames,
        int nationalIdColumnIndex,
        IReadOnlyList<InspectedColumn> columns);
}
