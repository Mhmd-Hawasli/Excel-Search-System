import type { ApiEnvelope } from "@/types/api";
import type { LinkedSheetsConfig, SheetInspection, UploadJobDto, WorkbookInspection } from "@/types/model";
import { apiFetch, apiGet, apiPost } from "./api-client";

export interface UploadJobEnvelope {
  jobId: string;
}

export interface MappingTemplate {
  id: string;
  groupId: string;
  name: string;
  mapping: unknown;
}

export const uploadService = {
  async inspect(file: File): Promise<WorkbookInspection> {
    const form = new FormData();
    form.append("file", file);
    const envelope = await apiFetch<ApiEnvelope<WorkbookInspection>>("/api/workbooks/inspect", {
      method: "POST",
      body: form,
    });
    if (!envelope.data) throw new Error("تعذر فحص الملف.");
    return envelope.data;
  },

  async sheet(token: string, sheetName: string): Promise<SheetInspection> {
    const envelope = await apiPost<ApiEnvelope<SheetInspection>>("/api/workbooks/sheet", { token, sheetName });
    if (!envelope.data) throw new Error("تعذر قراءة الورقة.");
    return envelope.data;
  },

  async linked(token: string, linkedSheets: LinkedSheetsConfig): Promise<SheetInspection> {
    const envelope = await apiPost<ApiEnvelope<SheetInspection>>("/api/workbooks/linked", {
      token,
      linkedSheets: linkedSheets.sheetNames,
      nationalIdColumnIndex: linkedSheets.nationalIdColumnIndex,
    });
    if (!envelope.data) throw new Error("تعذر ربط الأوراق.");
    return envelope.data;
  },

  async createJob(body: Record<string, unknown>): Promise<{ jobId: string }> {
    const envelope = await apiPost<ApiEnvelope<UploadJobEnvelope>>("/api/upload-jobs", body);
    if (!envelope.data?.jobId) throw new Error("تعذر بدء مهمة الاستيراد.");
    return { jobId: envelope.data.jobId };
  },

  async getJob(id: string): Promise<UploadJobDto> {
    const envelope = await apiGet<ApiEnvelope<UploadJobDto>>(`/api/upload-jobs/${id}`);
    if (!envelope.data) throw new Error("مهمة الرفع غير موجودة.");
    return envelope.data;
  },

  async saveTemplate(jobId: string, name: string): Promise<void> {
    await apiPost<ApiEnvelope<unknown>>(`/api/upload-jobs/${jobId}/template`, { name });
  },

  async templates(groupId?: string): Promise<MappingTemplate[]> {
    const envelope = await apiGet<ApiEnvelope<{ templates: MappingTemplate[] }>>(
      `/api/upload-jobs/templates${groupId ? `?groupId=${encodeURIComponent(groupId)}` : ""}`,
    );
    return envelope.data?.templates ?? [];
  },

  async replace(fileId: string, body: Record<string, unknown>): Promise<{ jobId: string }> {
    const envelope = await apiPost<ApiEnvelope<UploadJobEnvelope>>(`/api/files/${fileId}/replace`, body);
    if (!envelope.data?.jobId) throw new Error("تعذر بدء الاستبدال.");
    return { jobId: envelope.data.jobId };
  },
};
