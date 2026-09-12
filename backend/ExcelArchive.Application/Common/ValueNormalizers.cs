using ExcelArchive.Domain.Text;

namespace ExcelArchive.Application.Common;

/// <summary>
/// Application-layer façade over domain text normalization.
/// Application code should depend on this (not on Domain.Text directly),
/// so the normalization contract has a single stable entry point.
/// </summary>
public static class ValueNormalizers
{
    public static string NormalizeStored(object? value) => ArabicNormalizer.NormalizeStored(value);

    public static IReadOnlyList<string> NormalizeQuery(object? value) => ArabicNormalizer.NormalizeQuery(value);

    public static string DigitsOnly(object? value) => ArabicNormalizer.DigitsOnly(value);

    public static string NormalizeNationalId(object? value) => ArabicNormalizer.NormalizeNationalId(value);

    public static long? NationalIdAsBigInt(object? value) => ArabicNormalizer.NationalIdAsBigInt(value);
}
