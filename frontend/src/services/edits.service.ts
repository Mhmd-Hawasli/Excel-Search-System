import { apiGet } from "./api-client";

export interface EditedFileSummary {
  fileId: string;
  fileName: string;
  groupId: string;
  groupName: string;
  editCount: number;
  lastEditAt: string;
}

export interface EditHistoryItem {
  id: string;
  /** Null for edits archived from a previous file version (record replaced). */
  recordId: string | null;
  fileId: string;
  fileColumnId: string | null;
  /** File version this edit was made on (1 = first version). */
  fileVersion: number;
  headerRaw: string;
  oldValue: string;
  newValue: string;
  createdAt: string;
  personName: string | null;
  rowIndex: number | null;
  editedBy: string | null;
}

export interface EditHistoryPage {
  items: EditHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const editsService = {
  summary(): Promise<{ files: EditedFileSummary[] }> {
    return apiGet<{ files: EditedFileSummary[] }>("/api/edits", { view: "summary" });
  },
  history(fileId?: string, page = 1, pageSize = 25): Promise<EditHistoryPage> {
    return apiGet<EditHistoryPage>("/api/edits", { view: "history", fileId, page, pageSize });
  },
  exportUrl(fileId: string, markEdits = false): string {
    return `/api/files/${fileId}/export${markEdits ? "?markEdits=true" : ""}`;
  },
};
