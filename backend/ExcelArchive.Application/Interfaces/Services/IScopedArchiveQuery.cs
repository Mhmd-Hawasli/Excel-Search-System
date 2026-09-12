using ExcelArchive.Application.DTOs.AuthDto;

namespace ExcelArchive.Application.Interfaces.Services;

/// <summary>
/// Resolves which archive files/groups the user may see.
/// Null list means unrestricted scope; an empty list means explicitly no access.
/// </summary>
public interface IScopedArchiveQuery
{
    Task<DataScopeDto> ResolveAsync(CurrentUserDto user, CancellationToken ct = default);
}
