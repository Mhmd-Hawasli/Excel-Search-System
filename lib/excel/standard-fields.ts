import { StandardField } from "@/generated/prisma/client";

import {
  STANDARD_FIELD_KEYS,
  type StandardFieldKey,
} from "@/lib/excel/types";

/**
 * Server-only bridge between the client-safe field catalog and the Prisma
 * `StandardField` enum. The client must never import this module.
 */

export {
  STANDARD_FIELD_KEYS,
  STANDARD_FIELD_LABELS,
  suggestStandardField,
} from "@/lib/excel/standard-field-catalog";
export type { StandardFieldKey } from "@/lib/excel/types";

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
  job_title: StandardField.JOB_TITLE,
  functional_category: StandardField.FUNCTIONAL_CATEGORY,
  organizational_level: StandardField.ORGANIZATIONAL_LEVEL,
};

/** Maps a Prisma enum member back to its catalog key. */
export function standardFieldKey(value: StandardField): StandardFieldKey | null {
  const entry = STANDARD_FIELD_KEYS.find((key) => PRISMA_STANDARD_FIELDS[key] === value);
  return entry ?? null;
}
