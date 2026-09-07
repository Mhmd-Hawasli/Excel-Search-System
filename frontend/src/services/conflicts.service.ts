import { apiGet } from "./api-client";

export interface ConflictRow {
  recordId: string;
  fileName: string;
  rowIndex: number;
  fullName: string | null;
  nationalId: string | null;
  rule: string;
  description: string;
}

export interface ConflictsResult {
  rows: ConflictRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const conflictsService = {
  list(page = 1, pageSize = 50): Promise<ConflictsResult> {
    return apiGet<ConflictsResult>("/api/conflicts", { page, pageSize });
  },
};
