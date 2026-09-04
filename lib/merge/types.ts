/**
 * Types for the isolated "merge files" section.
 *
 * This section is deliberately self-contained: it never reads or writes the
 * archive database. Uploaded workbooks live in `tmp/merge` and merge sessions
 * live only in server memory.
 */

/** Column semantics the user must map for each of the two tables. */
export const MERGE_FIELD_KEYS = [
  "fullName",
  "firstName",
  "fatherName",
  "lastName",
  "motherName",
  "nationalId",
  "personalNo",
  "shamCash",
  "phone",
] as const;

export type MergeFieldKey = (typeof MERGE_FIELD_KEYS)[number];

/** Field label shown in the mapping UI (Arabic). */
export const MERGE_FIELD_LABELS: Record<MergeFieldKey, string> = {
  fullName: "الاسم الثلاثي",
  firstName: "الاسم",
  fatherName: "اسم الأب",
  lastName: "النسبة",
  motherName: "اسم الأم",
  nationalId: "الرقم الوطني",
  personalNo: "الرقم الذاتي",
  shamCash: "الشام كاش",
  phone: "رقم الهاتف",
};

/** 0-based column index per field for one uploaded table. */
export type MergeMapping = Partial<Record<MergeFieldKey, number>>;

export const MERGE_RULE_KEYS = [
  "full_name",
  "composed_name",
  "national_id",
  "personal_no",
  "sham_cash",
  "phone",
] as const;

export type MergeRuleKey = (typeof MERGE_RULE_KEYS)[number];

export const MERGE_RULES: ReadonlyArray<{
  key: MergeRuleKey;
  order: number;
  label: string;
  description: string;
  /** Fields needed on BOTH tables for the rule to be available. */
  required: ReadonlyArray<MergeFieldKey>;
}> = [
  {
    key: "full_name",
    order: 1,
    label: "القاعدة الأولى — الربط بالاسم الثلاثي مع التأكد باسم الأم",
    description:
      "شرطها عدم تكرار الاسم الثلاثي مع اسم الأم في الملف الواحد. يُقارن الاسم الثلاثي بعد التنميط، والتأكد بمقارنة الكلمة الأولى من اسم الأم.",
    required: ["fullName"],
  },
  {
    key: "composed_name",
    order: 2,
    label: "القاعدة الثانية — دمج الاسم مع اسم الأب مع النسبة",
    description:
      "تُطبَّق على الأسطر التي لم يرتبط اسمها الثلاثي: يُكوَّن الاسم الثلاثي من الاسم + اسم الأب + النسبة ويُربط بالاسم الثلاثي في الجدول الآخر أو بالاسم المكوَّن إن كان غير مربوط، مع التأكد باسم الأم.",
    required: ["fullName", "firstName", "fatherName", "lastName"],
  },
  {
    key: "national_id",
    order: 3,
    label: "القاعدة الثالثة — الربط بالرقم الوطني",
    description:
      "شرطها عدم تكرار الرقم الوطني في الملف الواحد. يُقارن الرقم بعد تحويل الأرقام العربية وحذف الفراغات، والتأكد بالاسم الثلاثي.",
    required: ["nationalId"],
  },
  {
    key: "personal_no",
    order: 4,
    label: "القاعدة الرابعة — الربط بالرقم الذاتي",
    description:
      "شرطها عدم تكرار الرقم الذاتي في الملف الواحد. يُقارن الرقم بعد تحويل الأرقام العربية وحذف الفراغات، والتأكد بالاسم الثلاثي.",
    required: ["personalNo"],
  },
  {
    key: "sham_cash",
    order: 5,
    label: "القاعدة الخامسة — الربط بالشام كاش",
    description:
      "شرطها عدم تكرار الشام كاش في الملف الواحد. يُقارن الرقم بعد تحويل الأرقام العربية وحذف الفراغات، والتأكد بالاسم الثلاثي.",
    required: ["shamCash"],
  },
  {
    key: "phone",
    order: 6,
    label: "القاعدة السادسة — الربط برقم الهاتف",
    description:
      "شرطها عدم تكرار رقم الهاتف في الملف الواحد. يُقارن الرقم بعد تحويل الأرقام العربية وحذف الفراغات، والتأكد بالاسم الثلاثي.",
    required: ["phone"],
  },
];

/** One data row of a merged table. */
export type MergeRow = {
  /** 1-based Excel row number (header is row 1, data starts at row 2). */
  rowNumber: number;
  /** Original cell values in original header order. */
  cells: string[];
  /** Shared link key, identical in both tables; null when not linked. */
  key: string | null;
  /** The rule that produced the key, null when not linked. */
  rule: MergeRuleKey | null;
  /**
   * True when the confirmation value existed on both sides and matched.
   * False when the link was made without a usable confirmation (missing
   * column/cell) — such rows are flagged in the UI.
   */
  confirmed: boolean;
};

export type MatchPair = {
  key: string;
  rule: MergeRuleKey;
  leftRowNumber: number;
  rightRowNumber: number;
  /** Confirmation value used for the pair (or null when unavailable). */
  confirmed: boolean;
  /** Raw link values (for display in the per-rule list). */
  leftValue: string;
  rightValue: string;
};

export type RuleStat = {
  key: MergeRuleKey;
  order: number;
  label: string;
  description: string;
  available: boolean;
  reason: string | null;
  matchedPairs: number;
  pairs: MatchPair[];
};

export type MergeStatus = {
  state: "complete" | "partial";
  matchedPairs: number;
  /** min(left rows, right rows): the largest possible number of pairs. */
  total: number;
  percent: number;
};

export type MergeTableInput = {
  headers: string[];
  rows: Array<{ rowNumber: number; cells: string[] }>;
  mapping: MergeMapping;
};

export type MergeResult = {
  left: MergeRow[];
  right: MergeRow[];
  pairs: MatchPair[];
  rules: RuleStat[];
  status: MergeStatus;
};

/** Inspection of one uploaded file (mirrors the system workbook inspection). */
export type MergeInspection = {
  token: string;
  originalFilename: string;
  sheets: Array<{ name: string; rowCount: number }>;
  selected: {
    sheetName: string;
    headers: string[];
    preview: string[][];
    rowCount: number;
    columnCount: number;
  };
};

/** The run request sent by the wizard. */
export type MergeRunInput = {
  left: { token: string; sheetName: string; mapping: MergeMapping };
  right: { token: string; sheetName: string; mapping: MergeMapping };
};

export const MERGE_KEY_HEADER = "مفتاح الربط";
export const MERGE_SHEET_NAMES = ["الجدول الأول", "الجدول الثاني"] as const;
export const MAX_MERGE_ROWS = 5_000;
