export interface Group {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  recordCount: number;
  includeInDefaultSearch: boolean;
  /** Private group: visible only to its owner + groups.viewPrivate holders. */
  isPrivate?: boolean | null;
  ownerUsername?: string | null;
  ownerUserId?: string | null;
}

export interface GroupFile {
  id: string;
  groupId: string;
  name: string;
  description: string;
  originalFilename: string;
  rowCount: number;
  columnCount: number;
  version: number;
  uploadedAt: string;
  groupName?: string | null;
  hasEdits: boolean;
}

export interface DashboardData {
  groupCount: number;
  fileCount: number;
  recordCount: number;
  recentFiles: GroupFile[];
}

export interface FileItem {
  id: string;
  groupId: string;
  name: string;
  description: string;
  originalFilename: string;
  sheetName: string;
  rowCount: number;
  columnSignature: string;
  version: number;
  uploadedAt: string;
  updatedAt: string;
  groupName?: string;
  columnCount?: number;
}

export interface FileColumn {
  id: string;
  headerRaw: string;
  headerNormalized: string;
  columnIndex: number;
  standardField: string | null;
  categoryId: string | null;
  categoryName?: string | null;
}

export interface SearchResult {
  id: string;
  fileId: string;
  fileName: string;
  groupId: string;
  groupName: string;
  rowIndex: number;
  fullName: string | null;
  nationalId: string | null;
  phone: string | null;
  data: Record<string, unknown>;
}
export interface CurrentUser {
  id: string;
  username: string;
  displayName: string | null;
  permissions: PermissionAssignment[];
}

export interface UploadJobDto {
  id: string;
  fileId: string | null;
  status: "PENDING" | "PARSING" | "INSERTING" | "DONE" | "FAILED" | string;
  totalRows: number;
  processedRows: number;
  errorMessage: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

import type { StandardFieldKey } from "@/lib/standard-fields";

export interface InspectedColumn {
  headerRaw: string;
  headerNormalized: string;
  columnIndex: number;
  suggestedField: StandardFieldKey | null;
  sourceSheetName?: string | null;
}

export interface LinkedSheetsConfig {
  sheetNames: string[];
  nationalIdColumnIndex: number;
}

export interface LinkedSheetSummary {
  sheetName: string;
  matchedRows: number;
  missingRows: number;
}

export interface SheetInspection {
  sheetName: string;
  sheetIndex: number;
  rowCount: number;
  columnCount: number;
  columns: InspectedColumn[];
  preview: string[][];
  linkedSheets?: LinkedSheetsConfig | null;
  linkedSummary?: LinkedSheetSummary[] | null;
}

export interface WorkbookInspection {
  token: string;
  originalFilename: string;
  sheets: Array<{ name: string; rowCount: number }>;
  selected: SheetInspection;
}

export interface ReplacePreviewChange {
  rowIndex: number;
  headerRaw: string;
  columnIndex: number;
  currentValue: string;
  newValue: string;
  wasManuallyEdited: boolean;
  editedBy: string | null;
  editedAt: string | null;
  matchKey: string | null;
}

export interface ReplacePreviewColumnStat {
  headerRaw: string;
  columnIndex: number;
  changedCells: number;
  manualOverwriteCells: number;
  formattingOnlyCells?: number;
}

export interface ReplacePreviewNewColumn {
  headerRaw: string;
  columnIndex: number;
  filledValues: number;
}

export interface ReplacePreviewSummary {
  totalRowsCurrent: number;
  totalRowsNew: number;
  matchedRows: number;
  addedRows: number;
  removedRows: number;
  totalCellsCompared: number;
  changedCells: number;
  changedRows: number;
  unchangedRows: number;
  manualOverwriteCount: number;
  matchMode: string;
  hasMoreChanges: boolean;
  formattingOnlyCells?: number;
}

export interface ReplacePreview {
  identical: boolean;
  addedColumns: string[];
  removedColumns: string[];
  summary: ReplacePreviewSummary | null;
  columnStats: ReplacePreviewColumnStat[] | null;
  changes: ReplacePreviewChange[] | null;
  addedRowSample: number[] | null;
  removedRowSample: number[] | null;
  truncated: boolean;
  matchMode: string | null;
  nationalIdHeader: string | null;
  currentVersion: number;
  newColumns: ReplacePreviewNewColumn[] | null;
  pendingEditCount: number;
  nextVersion: number;
}

export interface CategoryOption {
  id: string;
  name: string;
}

export interface PermissionAssignment {
  permission: string;
  groupId?: string | null;
  fileId?: string | null;
}
