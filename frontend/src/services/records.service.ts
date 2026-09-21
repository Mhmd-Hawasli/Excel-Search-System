import type { ApiEnvelope } from "@/types/api";
import { apiDelete, apiGet, apiPost } from "./api-client";

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
  lastBy?: string | null;
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

export interface RecordEditInfo {
  id: string;
  headerRaw: string;
  fileColumnId: string | null;
  oldValue: string;
  newValue: string;
  createdAt: string;
  editedBy: string | null;
}

export interface SaveEditResult {
  ok: boolean;
  changed: boolean;
  message?: string;
  oldValue?: string;
  newValue?: string;
  edits?: Record<string, EditedHeaderInfo>;
}

export interface ManualTemplateColumn {
  id: string;
  headerRaw: string;
  standardField: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryOrder: number | null;
  columnIndex: number;
}

export interface ManualTemplate {
  fileId: string;
  fileName: string;
  groupId: string;
  groupName: string;
  columns: ManualTemplateColumn[];
}

export interface SuggestionList {
  fileId: string;
  standardField: string | null;
  columnId: string | null;
  headerRaw: string;
  values: string[];
}

export interface ManualCreated {
  id: string;
  fileId: string;
  rowIndex: number;
}

export const recordsService = {
  async get(id: string): Promise<RecordDetail> {
    const envelope = await apiGet<ApiEnvelope<RecordDetail>>(`/api/records/${id}`);
    if (!envelope.data) throw new Error("غير موجود.");
    return envelope.data;
  },
  async getEdits(id: string): Promise<{ edits: RecordEditInfo[]; editedHeaders: Record<string, EditedHeaderInfo> }> {
    const envelope = await apiGet<ApiEnvelope<{ edits: RecordEditInfo[]; editedHeaders: Record<string, EditedHeaderInfo> }>>(
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
  async template(fileId: string): Promise<ManualTemplate> {
    const envelope = await apiGet<ApiEnvelope<ManualTemplate>>(`/api/files/${fileId}/record-template`);
    if (!envelope.data) throw new Error("تعذر تحميل أعمدة الملف.");
    return envelope.data;
  },
  async suggestions(fileId: string, params: { standardField?: string; columnId?: string; take?: number }): Promise<SuggestionList> {
    const envelope = await apiGet<ApiEnvelope<SuggestionList>>(`/api/files/${fileId}/suggestions`, {
      standardField: params.standardField ?? "",
      columnId: params.columnId ?? "",
      take: params.take ?? 50,
    });
    if (!envelope.data) throw new Error("تعذر تحميل الاقتراحات.");
    return envelope.data;
  },
  async createManual(fileId: string, values: Record<string, string>): Promise<ManualCreated> {
    const envelope = await apiPost<ApiEnvelope<ManualCreated>>(`/api/files/${fileId}/records`, { values });
    if (!envelope.data) throw new Error("تعذر حفظ السجل.");
    return envelope.data;
  },
  async validateManual(fileId: string, values: Record<string, string>): Promise<{ ok: boolean }> {
    const envelope = await apiPost<ApiEnvelope<{ ok: boolean }>>(`/api/files/${fileId}/records/validate`, { values });
    return envelope.data ?? { ok: true };
  },
  async remove(id: string): Promise<{ fileId: string; rowIndex: number }> {
    const envelope = await apiDelete<ApiEnvelope<{ fileId: string; rowIndex: number }>>(`/api/records/${id}`);
    if (!envelope.data) throw new Error("تعذر حذف السجل.");
    return envelope.data;
  },
};
