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
  recordId: string;
  fileId: string;
  fileColumnId: string | null;
  headerRaw: string;
  oldValue: string;
  newValue: string;
  createdAt: string;
  personName: string | null;
  rowIndex: number | null;
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
  exportUrl(fileId: string): string {
    return `/api/files/${fileId}/export`;
  },
};
