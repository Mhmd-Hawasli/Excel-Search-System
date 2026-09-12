using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace ExcelArchive.Infrastructure.Implementations.Persistence;

/// <summary>
/// Converts C# enum values to the lowercase/snake_case strings used by the
/// existing Prisma schema (e.g. FirstName -> first_name, GroupCreated ->
/// group_created) so existing PostgreSQL data remains compatible.
/// </summary>
public class EnumToPrismaConverter<TEnum> : ValueConverter<TEnum, string>
    where TEnum : struct, Enum
{
    public EnumToPrismaConverter()
        : base(value => ToPrismaValue(value), value => FromPrismaValue(value))
    {
    }

    private static string ToPrismaValue(TEnum value)
    {
        var camel = value.ToString();
        return Regex.Replace(camel, "([a-z])([A-Z])", "$1_$2").ToLowerInvariant();
    }

    private static TEnum FromPrismaValue(string value)
    {
        // snake_case -> PascalCase: file_replaced -> FileReplaced
        var parts = value.Split('_', StringSplitOptions.RemoveEmptyEntries);
        var pascal = string.Concat(parts.Select(p => char.ToUpperInvariant(p[0]) + p[1..]));
        return Enum.TryParse<TEnum>(pascal, out var result) ? result : throw new ArgumentOutOfRangeException(nameof(value), value, null);
    }
}
