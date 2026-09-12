namespace ExcelArchive.Application.DTOs.SearchDto;

/// <summary>Logical search plan: which fields/tokens participate. Pure data, no SQL.</summary>
public sealed record SearchField(string Key, string Kind, string Column);

public sealed record SearchPlan(
    IReadOnlyList<SearchField> Fields,
    IReadOnlyList<string> TextTokens,
    string NumericNeedle,
    string NormalizedText,
    int? CategoryNeedle);
