import { digitsOnly } from "@/lib/normalization/arabic";

export const SHAM_CASH_DIGITS = 16;

export function normalizeShamCash(value: unknown) {
  const digits = digitsOnly(value);
  return digits.length === SHAM_CASH_DIGITS ? digits : null;
}

export function shamCashAsBigInt(value: unknown) {
  const normalized = normalizeShamCash(value);
  return normalized === null ? null : BigInt(normalized);
}

export function formatShamCash(value: string | number | bigint | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const digits = digitsOnly(value);
  if (!digits || digits.length > SHAM_CASH_DIGITS) return String(value);
  return digits
    .padStart(SHAM_CASH_DIGITS, "0")
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}
