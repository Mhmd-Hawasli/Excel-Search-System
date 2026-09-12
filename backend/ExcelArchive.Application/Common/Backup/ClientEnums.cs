using System.Text.Json;
using System.Text.RegularExpressions;

namespace ExcelArchive.Application.Common.Backup;

/// <summary>V1 Prisma client enum member names (UPPER_SNAKE) used in archive JSON.</summary>
internal static class ClientEnums
{
    internal static string ClientEnumName<TEnum>(TEnum value) where TEnum : struct, Enum =>
        Regex.Replace(value.ToString(), "([a-z0-9])([A-Z])", "$1_$2").ToUpperInvariant();

    internal static TEnum ParseClientEnum<TEnum>(JsonElement element, string what) where TEnum : struct, Enum
    {
        if (element.ValueKind != JsonValueKind.String)
            throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
        var text = element.GetString() ?? "";
        string pascal = text.Contains('_')
            ? string.Concat(text.Split('_', StringSplitOptions.RemoveEmptyEntries)
                .Select(p => char.ToUpperInvariant(p[0]) + p[1..].ToLowerInvariant()))
            : text;
        if (Enum.TryParse<TEnum>(pascal, ignoreCase: true, out var result)
            && Enum.IsDefined(typeof(TEnum), result))
            return result;
        throw new InvalidOperationException("ملف النسخة الاحتياطية غير صالح أو غير متوافق.");
    }
}

internal static class BackupProtocol
{
    internal const int SupportedVersion = 1;
    internal const string ApplicationName = "excel-archive-search";
    internal const string AccountsApplicationName = "excel-archive-search-accounts";
}
