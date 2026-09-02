import type { StandardFieldKey } from "@/lib/excel/types";
import { STANDARD_FIELD_LABELS } from "@/lib/excel/standard-fields";

export type SearchFieldType = "text" | "numeric";
export type SearchField = { key: StandardFieldKey; label: string; type: SearchFieldType; column: string };

export const SEARCH_FIELDS: SearchField[] = [
  { key: "full_name", label: STANDARD_FIELD_LABELS.full_name, type: "text", column: "n_full_name" },
  { key: "national_id", label: STANDARD_FIELD_LABELS.national_id, type: "numeric", column: "d_national_id" },
  { key: "first_name", label: STANDARD_FIELD_LABELS.first_name, type: "text", column: "n_first_name" },
  { key: "father_name", label: STANDARD_FIELD_LABELS.father_name, type: "text", column: "n_father_name" },
  { key: "last_name", label: STANDARD_FIELD_LABELS.last_name, type: "text", column: "n_last_name" },
  { key: "mother_name", label: STANDARD_FIELD_LABELS.mother_name, type: "text", column: "n_mother_name" },
  { key: "sham_cash", label: STANDARD_FIELD_LABELS.sham_cash, type: "numeric", column: "sf_sham_cash" },
  { key: "personal_no", label: STANDARD_FIELD_LABELS.personal_no, type: "numeric", column: "d_personal_no" },
  { key: "phone", label: STANDARD_FIELD_LABELS.phone, type: "numeric", column: "d_phone" },
  { key: "contract_code", label: STANDARD_FIELD_LABELS.contract_code, type: "text", column: "n_contract_code" },
  { key: "secondary_contract_code", label: STANDARD_FIELD_LABELS.secondary_contract_code, type: "text", column: "n_secondary_contract_code" },
];

export const SEARCH_FIELD_MAP = Object.fromEntries(SEARCH_FIELDS.map((field) => [field.key, field])) as Record<StandardFieldKey, SearchField>;
