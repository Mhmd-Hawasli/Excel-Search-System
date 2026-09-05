/**
 * Types for the isolated "دمج صفحات ملف اكسيل" section.
 *
 * This section is completely separate from the archive: it never reads or
 * writes the database, never touches `tmp/`, and keeps the uploaded workbook
 * and its results only in a temporary in-memory session
 * (`lib/sheet-merge/store.ts`). Nothing here shares state with the files
 * section or with the "دمج الملفات" section — only generic Excel/normalization
 * helpers are reused.
 */

/** قاعدة الرفع: يجب أن يحتوي المصنف على أكثر من صفحة واحدة. */
export const SHEET_MERGE_MIN_SHEETS = 2;

/**
 * قاعدة الربط: يقرأ النظام قيمة الخلية ويحولها إلى رقم، ويجب أن يكون الرقم
 * أكثر من 7 محارف (8 أرقام فأكثر بعد حذف الأصفار البادئة).
 */
export const MIN_NATIONAL_ID_DIGITS = 8;

/** عدد الأسطر غير المرتبطة المرسلة للواجهة لكل صفحة (الباقي في ملف التصدير). */
export const UNLINKED_PREVIEW_LIMIT = 300;

export const MERGED_SHEET_NAME = "الدمج";
export const UNLINKED_SHEET_PREFIX = "غير مرتبط";
export const EXPORT_BASENAME = "دمج-الصفحات";

/** One data row of an uploaded sheet (header row skipped, blank rows skipped). */
export type UploadedSheetRow = {
  /** 1-based Excel row number. */
  rowNumber: number;
  cells: string[];
};

/** Every sheet of the uploaded workbook, held in memory. */
export type UploadedSheet = {
  name: string;
  /** True when the sheet was hidden inside Excel. */
  hidden: boolean;
  headers: string[];
  rows: UploadedSheetRow[];
  /** True when an auto-filter/table or hidden rows or columns were removed. */
  filtersRemoved: boolean;
};

export type UploadedWorkbook = {
  id: string;
  createdAt: number;
  originalFilename: string;
  sheets: UploadedSheet[];
};

/** The automatically suggested national-id column of the first sheet. */
export type NationalIdSuggestion = {
  /** 0-based column index, null when nothing could be suggested. */
  index: number | null;
  /** Arabic explanation of how the column was detected (shown in the UI). */
  reason: string | null;
};

export type UploadSheetSummary = {
  name: string;
  hidden: boolean;
  rowCount: number;
  columnCount: number;
  firstColumnHeader: string;
  filtersRemoved: boolean;
  /** False when the sheet cannot be linked (needs the id plus one column). */
  linkable: boolean;
  /** Why the sheet cannot be linked (null when linkable). */
  reason: string | null;
};

export type UploadInspection = {
  uploadId: string;
  originalFilename: string;
  sheetCount: number;
  sheets: UploadSheetSummary[];
  main: {
    name: string;
    headers: string[];
    preview: string[][];
    rowCount: number;
  };
  suggestion: NationalIdSuggestion;
};

/** What the wizard sends to run the merge. */
export type SheetMergeRunInput = {
  uploadId: string;
  /** 0-based national-id column index inside the FIRST sheet. */
  nationalIdColumn: number;
  /** Names of the additional sheets to merge (workbook order is applied). */
  sheetNames: string[];
};

/** A row that could not be linked, with the reason shown to the user. */
export type UnlinkedRow = {
  rowNumber: number;
  /** The national-id cell value exactly as read from Excel. */
  value: string;
  reason: string;
  /** Full row values in the sheet's own header order. */
  cells: string[];
};

export type SheetMergeSheetStat = {
  sheetName: string;
  role: "main" | "linked";
  /** Main sheet: every header. Linked sheet: headers without the id column. */
  headers: string[];
  /** The sheet's own headers in their original order (for the unlinked rows). */
  unlinkedHeaders: string[];
  rowCount: number;
  /** Rows successfully linked (main: filled from at least one linked sheet). */
  linkedCount: number;
  /** نسبة الربط 0..100 (decimal kept to one digit). */
  percent: number;
  validKeyCount: number;
  invalidCount: number;
  duplicateCount: number;
  /** Linked sheets only: valid unique ids missing from the main sheet. */
  missingCount: number;
  unlinkedTotal: number;
  /** First UNLINKED_PREVIEW_LIMIT unlinked rows (values shown to the user). */
  unlinked: UnlinkedRow[];
};

export type SheetMergeResult = {
  sessionId: string;
  originalFilename: string;
  mainSheetName: string;
  nationalIdColumn: number;
  nationalIdHeader: string;
  /** Final exported headers: main columns, then each linked sheet minus its id. */
  exportHeaders: string[];
  exportRowCount: number;
  /** Weighted link percentage across the linked sheets. */
  linkPercent: number;
  sheets: SheetMergeSheetStat[];
};
