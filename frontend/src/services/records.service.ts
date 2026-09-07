import { apiGet, apiPost } from "./api-client";

export interface RecordDetail {
  id: string;
  fileId: string;
  fileName: string;
  groupId: string;
  groupName: string;
  rowIndex: number;
  data: Record<string, unknown>;
  edits: Array<{
    id: string;
    headerRaw: string;
    oldValue: string;
    newValue: string;
    createdAt: string;
  }>;
}

export const recordsService = {
  get(id: string): Promise<RecordDetail> {
    return apiGet<RecordDetail>(`/api/records/${id}`);
  },
  visit(id: string) {
    return apiPost<{ ok: boolean }>(`/api/records/${id}/visit`);
  },
};
