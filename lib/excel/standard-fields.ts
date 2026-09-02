import { StandardField } from "@prisma/client";
import { normalizeStored } from "@/lib/normalization/arabic";
import { STANDARD_FIELD_KEYS, type StandardFieldKey } from "@/lib/excel/types";

export const STANDARD_FIELD_LABELS: Record<StandardFieldKey, string> = {
  first_name: "الاسم",
  father_name: "اسم الأب",
  last_name: "النسبة",
  full_name: "الاسم الثلاثي",
  national_id: "الرقم الوطني",
  sham_cash: "الشام كاش",
  personal_no: "الرقم الذاتي",
  mother_name: "اسم الأم",
  phone: "رقم الهاتف",
  contract_code: "رمز العقد الأساسي",
  secondary_contract_code: "رمز العقد الثانوي",
};

export const PRISMA_STANDARD_FIELDS: Record<StandardFieldKey, StandardField> = {
  first_name: StandardField.FIRST_NAME,
  father_name: StandardField.FATHER_NAME,
  last_name: StandardField.LAST_NAME,
  full_name: StandardField.FULL_NAME,
  national_id: StandardField.NATIONAL_ID,
  sham_cash: StandardField.SHAM_CASH,
  personal_no: StandardField.PERSONAL_NO,
  mother_name: StandardField.MOTHER_NAME,
  phone: StandardField.PHONE,
  contract_code: StandardField.CONTRACT_CODE,
  secondary_contract_code: StandardField.SECONDARY_CONTRACT_CODE,
};

const ALIASES: Record<StandardFieldKey, string[]> = {
  first_name: ["الاسم", "اسم"],
  father_name: ["اسم الاب", "الاب", "اسم الوالد"],
  last_name: ["النسبه", "الكنيه", "اللقب"],
  full_name: ["الاسم الثلاثي", "الاسم الكامل", "اسم الشخص"],
  national_id: ["الرقم الوطني", "رقم وطني", "الرقم الوطنى", "الرقم القومي"],
  sham_cash: ["الشام كاش", "شام كاش", "رقم شام كاش"],
  personal_no: ["الرقم الذاتي", "رقم ذاتي", "الرقم الوظيفي"],
  mother_name: ["اسم الام", "الام", "اسم الوالده"],
  phone: ["رقم الهاتف", "الهاتف", "الموبايل", "الجوال", "رقم الموبايل"],
  contract_code: ["رمز العقد الأساسي", "كود العقد الأساسي", "رقم العقد الأساسي", "رمز العقد", "كود العقد", "رقم العقد"],
  secondary_contract_code: ["رمز العقد الثانوي", "كود العقد الثانوي", "رقم العقد الثانوي", "الرمز الثانوي للعقد", "رمز العقد الإضافي", "رمز العقد الاضافي", "كود العقد الإضافي"],
};

function bigrams(value: string) {
  if (value.length < 2) return new Set([value]);
  return new Set(Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)));
}

function dice(left: string, right: string) {
  if (left === right) return 1;
  const a = bigrams(left);
  const b = bigrams(right);
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return (2 * overlap) / (a.size + b.size || 1);
}

export function suggestStandardField(header: string): StandardFieldKey | null {
  const normalized = normalizeStored(header);
  let best: { key: StandardFieldKey; score: number } | null = null;
  for (const key of STANDARD_FIELD_KEYS) {
    for (const alias of ALIASES[key]) {
      const candidate = normalizeStored(alias);
      const score = normalized === candidate ? 1 : normalized.includes(candidate) || candidate.includes(normalized) ? 0.9 : dice(normalized, candidate);
      if (!best || score > best.score) best = { key, score };
    }
  }
  return best && best.score >= 0.58 ? best.key : null;
}
