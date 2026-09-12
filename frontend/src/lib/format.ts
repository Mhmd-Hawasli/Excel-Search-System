import { digitsOnly } from "@/lib/normalization";

/**
 * Display form of a sham-cash value: 16 digits grouped in fours, padded with
 * leading zeros. Longer inputs fall back to the original text (V1 format).
 */
export function formatShamCash(value: string | number | bigint | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const digits = digitsOnly(value);
  if (!digits || digits.length > 16) return String(value);
  return digits
    .padStart(16, "0")
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}
