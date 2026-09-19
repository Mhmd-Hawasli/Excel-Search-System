import { apiGet, apiPost } from "./api-client";

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
  recordId: string | null;
  fileId: string;
  fileColumnId: string | null;
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

export interface EditsFilters {
  person?: string;
  column?: string;
  oldValue?: string;
  newValue?: string;
  version?: number;
  fromDate?: string;
  toDate?: string;
  user?: string;
  sortBy?: string;
  sortDir?: string;
}

export const editsService = {
  summary(): Promise<{ files: EditedFileSummary[] }> {
    return apiGet<{ files: EditedFileSummary[] }>("/api/edits", { view: "summary" });
  },
  history(fileId?: string, page = 1, pageSize = 25, filters?: EditsFilters): Promise<EditHistoryPage> {
    return apiGet<EditHistoryPage>("/api/edits", {
      view: "history",
      fileId,
      page,
      pageSize,
      ...filters,
    });
  },
  exportUrl(fileId: string, markEdits = false): string {
    return `/api/files/${fileId}/export${markEdits ? "?markEdits=true" : ""}`;
  },
  async revertEdit(recordId: string, fileColumnId?: string, headerRaw?: string): Promise<{ ok: boolean; changed: boolean; oldValue?: string; newValue?: string }> {
    const envelope = await apiPost("/api/edits/revert", { recordId, fileColumnId, headerRaw });
    return (envelope as unknown as { data: { ok: boolean; changed: boolean; oldValue?: string; newValue?: string } }).data;
  },
};
