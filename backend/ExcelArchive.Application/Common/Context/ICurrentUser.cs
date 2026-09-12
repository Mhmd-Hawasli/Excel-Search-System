namespace ExcelArchive.Application.Common.Context;

/// <summary>Authenticated user for the current request (framework-agnostic).</summary>
public interface ICurrentUser
{
    Guid? UserId { get; }
    string? Username { get; }
    string? DisplayName { get; }
    bool IsAuthenticated { get; }
    IReadOnlySet<string> Permissions { get; }
    IReadOnlyList<Guid>? GroupIds { get; }
    IReadOnlyList<Guid>? FileIds { get; }
    bool HasPermission(string key);
}
