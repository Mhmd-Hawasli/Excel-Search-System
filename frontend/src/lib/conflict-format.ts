/**
 * Display formatters ported from V1 lib/format/* (P4.5/UI-13).
 * Pure presentation; the backend remains authoritative.
 */

import { normalizeStored } from "@/lib/normalization";

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

/**
 * Strict sham-cash formatter for values of unknown origin (edit history,
 * activity logs): groups as 4-4-4-4 only when the value holds exactly 16
 * digits, otherwise returns null so the caller renders the original text.
 * Prevents mis-grouping other numeric identifiers.
 */
export function formatShamCashStrict(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (text.trim() === "") return null;
  const digits = digitsOnly(text);
  if (digits.length !== 16) return null;
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

const FUNCTIONAL_LABELS = [
  "فئة الأولى",
  "فئة الثانية",
  "فئة الثالثة",
  "فئة الرابعة",
  "فئة الخامسة",
];

/**
 * Client port of backend FunctionalCategory.Parse: stored numeric 1..5,
 * 0 = unknown non-empty value, null = empty. Mirrors the backend exactly,
 * including Arabic normalization, filler-word stripping and prefix matching,
 * so raw cell text ("الرابعة") displays the same label as the stored value.
 */
export function parseFunctionalCategory(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = toLatinDigits(String(value)).trim();
  if (!text) return null;
  const numeric = text.match(/^([0-9]+)(?:[.,][0-9]+)?$/);
  if (numeric) {
    const n = Number(numeric[1]);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
  }
  const normalized = normalizeStored(text).replace(/الفيه/g, " ").replace(/فيه/g, " ");
  let key = normalized.replace(/\s+/g, "").trim();
  if (key.startsWith("ال")) key = key.slice(2);
  key = key.trim();
  if (!key) return null;
  if (/^[0-9]+$/.test(key)) {
    const n = Number(key);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
  }
  if (key === "او" || key.startsWith("اول")) return 1;
  if (key.startsWith("ثان")) return 2;
  if (key === "لث" || key.startsWith("ثالث") || key.startsWith("ثلث")) return 3;
  if (key === "را" || key.startsWith("رابع")) return 4;
  if (key === "مس" || key.startsWith("خامس") || key.startsWith("خمس")) return 5;
  return 0;
}

export function formatFunctionalCategory(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const category = parseFunctionalCategory(value);
  if (category === null) return "";
  if (category === 0) return "فئة غير معروفة";
  return FUNCTIONAL_LABELS[category - 1];
}
