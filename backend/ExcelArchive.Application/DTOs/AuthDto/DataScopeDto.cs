namespace ExcelArchive.Application.DTOs.AuthDto;

/// <summary>
/// Null list means unrestricted scope; an empty list means explicitly no access.
/// This distinction is load-bearing for authorization and must be preserved.
/// </summary>
public record DataScopeDto
{
    public IReadOnlyList<Guid>? GroupIds { get; init; }
    public IReadOnlyList<Guid>? FileIds { get; init; }
}
