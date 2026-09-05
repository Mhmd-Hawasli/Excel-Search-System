const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;
const DIACRITICS = /[\u064B-\u0655\u0670]/g;
const TATWEEL = /\u0640/g;

export function toLatinDigits(value: string) {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const numeric =
      code >= EXTENDED_ARABIC_INDIC_ZERO
        ? code - EXTENDED_ARABIC_INDIC_ZERO
        : code - ARABIC_INDIC_ZERO;
    return String(numeric);
  });
}

export function normalizeStored(value: unknown) {
  const text = value == null ? "" : String(value);
  return toLatinDigits(text.trim().replace(/\s+/g, " "))
    .replace(DIACRITICS, "")
    .replace(TATWEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/عبد\s+/g, "عبد")
    .toLowerCase();
}

export function normalizeQuery(value: unknown) {
  return normalizeStored(value)
    .split(/\s+/)
    .map((token) => (token.startsWith("ال") && token.length - 2 >= 3 ? token.slice(2) : token))
    .filter(Boolean);
}

export function digitsOnly(value: unknown) {
  return toLatinDigits(value == null ? "" : String(value)).replace(/\D/g, "");
}

export function nationalIdDigits(value: unknown) {
  const text = toLatinDigits(value == null ? "" : String(value)).replace(/\s/g, "");
  if (!/^[0-9]+$/.test(text)) return null;
  return text.replace(/^0+/, "") || "0";
}

export function normalizeNationalId(value: unknown) {
  const digits = nationalIdDigits(value);
  return digits === null ? "" : digits.padStart(11, "0");
}

export function nationalIdAsBigInt(value: unknown) {
  const digits = nationalIdDigits(value);
  if (digits === null || digits.length > 19) return null;
  const number = BigInt(digits);
  return number <= 9223372036854775807n ? number : null;
}

export function matchesNormalizedText(query: unknown, stored: unknown) {
  const normalizedStored = normalizeStored(stored);
  const tokens = normalizeQuery(query);
  return tokens.length > 0 && tokens.every((token) => normalizedStored.includes(token));
}

export function matchesNumeric(query: unknown, stored: unknown) {
  const needle = digitsOnly(query);
  return needle.length > 0 && digitsOnly(stored).includes(needle);
}
