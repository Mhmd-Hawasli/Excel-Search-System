/**
 * Display formatters ported from V1 lib/format/* (P4.5/UI-13).
 * Pure presentation; the backend remains authoritative.
 */

const ARABIC_ZERO = 0x0660;
const EXTENDED_ZERO = 0x06f0;

export function toLatinDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= EXTENDED_ZERO ? code - EXTENDED_ZERO : code - ARABIC_ZERO);
  });
}

export function digitsOnly(value: unknown): string {
  return toLatinDigits(value == null ? "" : String(value)).replace(/\D/g, "");
}

export function formatNationalId(value: unknown): string {
  const text = value == null ? "" : String(value);
  const digits = toLatinDigits(text).replace(/\s/g, "");
  if (/^[0-9]+$/.test(digits) && digits.length > 0) {
    const stripped = digits.replace(/^0+/, "") || "0";
    return stripped.padStart(11, "0");
  }
  return toLatinDigits(text.trim());
}

export function formatShamCash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const digits = digitsOnly(value);
  if (!digits || digits.length > 16) return String(value);
  return digits
    .padStart(16, "0")
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}

const FUNCTIONAL_LABELS = [
  "فئة الأولى",
  "فئة الثانية",
  "فئة الثالثة",
  "فئة الرابعة",
  "فئة الخامسة",
];

export function formatFunctionalCategory(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const n = Number(String(value).trim());
  if (Number.isInteger(n) && n >= 1 && n <= 5) return FUNCTIONAL_LABELS[n - 1];
  if (/^[0-9]+$/.test(String(value).trim())) return "فئة غير معروفة";
  return "فئة غير معروفة";
}
