import { toLatinDigits } from "@/lib/normalization/arabic";
import { MIN_NATIONAL_ID_DIGITS } from "@/lib/sheet-merge/types";

/**
 * Link-key rule of this section: the national id of EVERY sheet is read from
 * the cell, converted to a number, and must be longer than 7 characters.
 *
 * - Arabic/Persian digits are converted to Latin digits.
 * - Spaces, non-breaking spaces and thousands separators are removed.
 * - A scientific/decimal text such as "1.23456789E+09" is accepted when it
 *   holds an exact integer (Excel stores long numbers that way).
 * - Leading zeros are dropped, then the key must have at least
 *   MIN_NATIONAL_ID_DIGITS digits — otherwise the row cannot be linked and is
 *   reported to the user with its reason.
 */

export type NationalIdIssue = "empty" | "characters" | "short";

/** Separators that never change the numeric value of an id. */
const SEPARATORS = /[\s\u00A0\u2007\u2009\u202F,\u066C\u066B]/g;

export type NationalIdReading = {
  /** Canonical digit key, or null when the row cannot be linked. */
  key: string | null;
  issue: NationalIdIssue | null;
  /** Canonical digits (empty when unreadable) — used in the reason text. */
  digits: string;
};

export function readNationalId(value: unknown): NationalIdReading {
  const text = toLatinDigits(value == null ? "" : String(value)).replace(SEPARATORS, "");
  if (!text) return { key: null, issue: "empty", digits: "" };

  let digitsText = text;
  if (!/^[0-9]+$/.test(digitsText)) {
    const parsed = Number(digitsText);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0)
      return { key: null, issue: "characters", digits: "" };
    digitsText = String(parsed);
  }

  const digits = digitsText.replace(/^0+/, "") || "0";
  if (digits.length < MIN_NATIONAL_ID_DIGITS) return { key: null, issue: "short", digits };
  return { key: digits, issue: null, digits };
}

/** Arabic reason shown to the user for a row that could not be linked. */
export function nationalIdIssueReason(issue: NationalIdIssue, digits = ""): string {
  if (issue === "empty") return "الرقم الوطني فارغ.";
  if (issue === "characters") return "القيمة تحتوي على أحرف غير رقمية.";
  return `الرقم ${digits} طوله ${digits.length} محارف — يجب أن يكون أكثر من ${
    MIN_NATIONAL_ID_DIGITS - 1
  } محارف.`;
}

export function duplicateReason(firstRowNumber: number): string {
  return `الرقم الوطني مكرر مع الصف ${firstRowNumber} — يجب ألا يتكرر داخل الصفحة.`;
}

export function missingInMainReason(mainSheetName: string): string {
  return `الرقم الوطني غير موجود في الصفحة الرئيسية «${mainSheetName}».`;
}
