export const STANDARD_FIELD_KEYS = [
  "first_name",
  "father_name",
  "last_name",
  "full_name",
  "national_id",
  "sham_cash",
  "personal_no",
  "mother_name",
  "phone",
  "contract_code",
  "secondary_contract_code",
] as const;
export type StandardFieldKey = (typeof STANDARD_FIELD_KEYS)[number];

export type InspectedColumn = {
  headerRaw: string;
  headerNormalized: string;
  columnIndex: number;
  suggestedField: StandardFieldKey | null;
  sourceSheetName?: string;
};

export type LinkedSheetsConfig = {
  sheetNames: string[];
  nationalIdColumnIndex: number;
};

export type SheetInspection = {
  sheetName: string;
  sheetIndex: number;
  rowCount: number;
  columnCount: number;
  columns: InspectedColumn[];
  preview: string[][];
  linkedSheets?: LinkedSheetsConfig;
  linkedSummary?: { sheetName: string; matchedRows: number; missingRows: number }[];
};

export type WorkbookInspection = {
  token: string;
  originalFilename: string;
  sheets: { name: string; rowCount: number }[];
  selected: SheetInspection;
};
