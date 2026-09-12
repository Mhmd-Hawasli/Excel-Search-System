namespace ExcelArchive.Application.Common;

/// <summary>Duplicate/conflict failure. Maps to HTTP 409 (V1 P2002 → 409,
/// e.g. duplicate username), unlike InvalidOperationException (422).</summary>
public sealed class ConflictException(string message) : Exception(message);
