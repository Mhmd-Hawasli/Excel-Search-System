import type { ApiEnvelope } from "@/types/api";
import type { FileColumn, FileItem } from "@/types/model";
import type { MutationResult } from "@/lib/mutation";
import { ApiError, apiDelete, apiGet, apiPost } from "./api-client";

export interface FileDetail {
  file: FileItem & { groupId: string; version: number; columnSignature: string; updatedAt: string; groupName?: string | null };
  columns: FileColumn[];
  qualityIssueCount: number;
  editCount: number;
}

export interface QualityIssue {
  rowIndex: number;
  issueType: string;
  columnName: string | null;
  rawValue: string | null;
}

export interface FileQuality {
  fileId: string;
  name: string;
  rowCount: number;
  counts: Array<{ issueType: string; count: number }>;
  issues: QualityIssue[];
}

export const filesService = {
  /**
   * Name check never throws for validation outcomes (invalid/duplicate come
   * back as {available:false}); only transport failures reject the promise.
   */
  async checkName(name: string): Promise<{ available: boolean; error?: string }> {
    try {
      return await apiPost<{ available: boolean; error?: string }>("/api/files/check-name", { name });
    } catch (err) {
      if (err instanceof ApiError) return { available: false, error: err.message };
      throw err;
    }
  },

  async detail(fileId: string, groupId: string): Promise<FileDetail> {
    const envelope = await apiGet<ApiEnvelope<FileDetail>>(
      `/api/files/${fileId}?groupId=${encodeURIComponent(groupId)}`,
    );
    if (!envelope.data) throw new Error("غير موجود.");
    return envelope.data;
  },

  async quality(fileId: string, groupId: string): Promise<FileQuality> {
    const envelope = await apiGet<ApiEnvelope<FileQuality>>(
      `/api/files/${fileId}/quality?groupId=${encodeURIComponent(groupId)}`,
    );
    if (!envelope.data) throw new Error("غير موجود.");
    return envelope.data;
  },

  async getMapping(fileId: string): Promise<{ fileId: string; name: string; columns: FileColumn[] }> {
    const envelope = await apiGet<ApiEnvelope<{ fileId: string; name: string; columns: FileColumn[] }>>(`/api/files/${fileId}/mapping`);
    if (!envelope.data) throw new Error("الملف غير موجود.");
    return envelope.data;
  },

  async updateMapping(
    fileId: string,
    columns: Array<{ id: string; standardField: string | null; categoryId: string | null }>,
  ): Promise<number> {
    const envelope = await apiPost<ApiEnvelope<{ ok: boolean; updatedRecords: number }>>(
      `/api/files/${fileId}/mapping`,
      { columns },
    );
    if (envelope.data?.updatedRecords === undefined) throw new Error("تعذر حفظ التعديلات.");
    return envelope.data.updatedRecords;
  },

  async remove(fileId: string, confirmName: string, groupId: string): Promise<MutationResult> {
    try {
      const envelope = await apiDelete<ApiEnvelope<null>>(`/api/files/${fileId}`, { confirmName });
      return {
        ok: true,
        message: envelope.message ?? "تم حذف الملف وكل سجلاته.",
        navigateTo: `/groups/${groupId}`,
      };
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.message : "تعذر حذف الملف." };
    }
  },

  async removeByForm(formData: FormData, groupId: string): Promise<MutationResult> {
    const id = String(formData.get("id") ?? "");
    const confirmName = String(formData.get("confirmName") ?? "");
    return this.remove(id, confirmName, groupId);
  },

  async listByGroup(groupId: string): Promise<FileItem[]> {
    const envelope = await apiGet<ApiEnvelope<{ files: FileItem[] }>>(`/api/groups/${groupId}/files`);
    return envelope.data?.files ?? [];
  },
};
