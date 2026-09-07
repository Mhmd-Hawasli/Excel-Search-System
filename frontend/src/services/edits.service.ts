import { apiGet } from "./api-client";

export interface EditedFileSummary {
  fileId: string;
  fileName: string;
  groupId: string;
  groupName: string;
  editCount: number;
  lastEditAt: string;
}

export const editsService = {
  summary(): Promise<{ files: EditedFileSummary[] }> {
    return apiGet<{ files: EditedFileSummary[] }>("/api/edits", { view: "summary" });
  },
  list(fileId?: string, page = 1): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    return apiGet<{ items: unknown[]; total: number; page: number; pageSize: number }>("/api/edits", { view: "list", fileId, page, pageSize: 25 });
  },
};
