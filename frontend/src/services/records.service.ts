import type { ApiEnvelope } from "@/types/api";
import { apiGet, apiPost } from "./api-client";

export interface RecordDetailColumn {
  id: string;
  headerRaw: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryOrder: number | null;
  standardField: string | null;
  value: string;
}

export interface EditedHeaderInfo {
  count: number;
  originalValue: string;
  lastValue: string;
  lastAt: string;
}

export interface RelatedRecord {
  id: string;
  sfFullName: string | null;
  sfFirstName: string | null;
  sfFatherName: string | null;
  sfLastName: string | null;
  sfMotherName: string | null;
  dNationalId: string | null;
  fileName: string;
  groupName: string;
  uploadedAt: string;
}

export interface RecordDetail {
  id: string;
  fileId: string;
  fileName: string;
  groupId: string;
  groupName: string;
  fileDescription: string;
  originalFilename: string;
  uploadedAt: string;
  rowIndex: number;
  displayName: string;
  sfNationalId: string | null;
  dNationalId: string | null;
  nationalIdNum: number | null;
  columns: RecordDetailColumn[];
  editedHeaders: Record<string, EditedHeaderInfo>;
  editCount: number;
  relatedByNationalId: { rows: RelatedRecord[]; truncated: boolean };
  relatedByPerson: { rows: RelatedRecord[]; truncated: boolean };
  conflictByNationalId: { rows: RelatedRecord[]; truncated: boolean };
  conflictByMother: { rows: RelatedRecord[]; truncated: boolean };
}

export interface SaveEditResult {
  ok: boolean;
  changed: boolean;
  message?: string;
  oldValue?: string;
  newValue?: string;
  edits?: Record<string, EditedHeaderInfo>;
}

export const recordsService = {
  async get(id: string): Promise<RecordDetail> {
    const envelope = await apiGet<ApiEnvelope<RecordDetail>>(`/api/records/${id}`);
    if (!envelope.data) throw new Error("غير موجود.");
    return envelope.data;
  },
  async getEdits(id: string): Promise<{ edits: unknown[]; editedHeaders: Record<string, EditedHeaderInfo> }> {
    const envelope = await apiGet<ApiEnvelope<{ edits: unknown[]; editedHeaders: Record<string, EditedHeaderInfo> }>>(
      `/api/records/${id}/edits`,
    );
    if (!envelope.data) throw new Error("تعذر تحميل التعديلات.");
    return envelope.data;
  },
  async saveEdit(id: string, body: { fileColumnId?: string; headerRaw?: string; newValue?: string; revert?: boolean }): Promise<SaveEditResult> {
    const envelope = await apiPost<ApiEnvelope<SaveEditResult>>(`/api/records/${id}/edits`, body);
    if (!envelope.data) throw new Error("تعذر حفظ التعديل.");
    return envelope.data;
  },
  async visit(id: string): Promise<{ ok: boolean }> {
    const envelope = await apiPost<ApiEnvelope<{ ok: boolean }>>(`/api/records/${id}/visit`);
    return envelope.data ?? { ok: true };
  },
};
