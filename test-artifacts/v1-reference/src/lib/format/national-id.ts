import {
  nationalIdAsBigInt,
  nationalIdDigits,
  normalizeNationalId,
  toLatinDigits,
} from "@/lib/normalization/arabic";

export type NationalIdIssue = "missing" | "characters" | "short" | "long";

export function nationalIdIssue(value: unknown): NationalIdIssue | null {
  const text = value == null ? "" : String(value);
  if (!text.trim()) return "missing";
  const digits = nationalIdDigits(text);
  if (digits === null) return "characters";
  if (digits.length <= 8) return "short";
  if (digits.length >= 12) return "long";
  return null;
}

export function formatNationalId(value: unknown) {
  const text = value == null ? "" : String(value);
  // Never truncate an oversized ID or hide invalid characters by stripping them.
  return normalizeNationalId(text) || toLatinDigits(text.trim());
}

export function nationalIdColumns(value: unknown) {
  const number = nationalIdAsBigInt(value);
  return {
    sfNationalId: number,
    dNationalId: normalizeNationalId(value) || null,
    nationalIdNum: nationalIdIssue(value) === null ? number : null,
  };
}
