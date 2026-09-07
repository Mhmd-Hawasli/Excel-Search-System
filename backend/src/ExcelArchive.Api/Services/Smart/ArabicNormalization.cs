using System.Text;

namespace ExcelArchive.Api.Services.Smart;

/// <summary>
/// Normalizes Arabic text the same way the frontend did: hamza variants,
/// ta marbuta, alef maqsura and Arabic/Persian digits are folded so search
/// results are independent of spelling variation.
/// </summary>
public static class ArabicNormalization
{
    private static readonly Dictionary<char, char> DigitMap = new()
    {
        ['٠'] = '0', ['١'] = '1', ['٢'] = '2', ['٣'] = '3', ['٤'] = '4',
        ['٥'] = '5', ['٦'] = '6', ['٧'] = '7', ['٨'] = '8', ['٩'] = '9',
        ['۰'] = '0', ['۱'] = '1', ['۲'] = '2', ['۳'] = '3', ['۴'] = '4',
        ['۵'] = '5', ['۶'] = '6', ['۷'] = '7', ['۸'] = '8', ['۹'] = '9',
    };

    public static string Normalize(string value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        var builder = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            var c = DigitMap.TryGetValue(ch, out var digit) ? digit : ch;
            if (c is 'أ' or 'إ' or 'آ' or 'ٱ') c = 'ا';
            if (c is 'ة') c = 'ه';
            if (c is 'ى') c = 'ي';
            if (c == 'ـ') continue;
            builder.Append(c);
        }
        return builder.ToString().Trim();
    }
}
