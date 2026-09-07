import type { ApiEnvelope } from "@/types/api";
import type { FileColumn, FileItem } from "@/types/model";
import { apiDelete, apiGet, apiPost } from "./api-client";

export const filesService = {
  async checkName(name: string): Promise<{ available: boolean; error?: string }> {
    return apiPost<{ available: boolean; error?: string }>("/api/files/check-name", { name });
  },
  async getMapping(fileId: string): Promise<{ fileId: string; name: string; columns: FileColumn[] }> {
    const envelope = await apiGet<ApiEnvelope<{ fileId: string; name: string; columns: FileColumn[] }>>(`/api/files/${fileId}/mapping`);
    if (!envelope.data) throw new Error("الملف غير موجود.");
    return envelope.data;
  },
  async updateMapping(fileId: string, columns: Array<{ id: string; standardField: string | null; categoryId: string | null }>) {
    const envelope = await apiPost<ApiEnvelope<unknown>>(`/api/files/${fileId}/mapping`, { columns });
    return envelope.data;
  },
  async remove(fileId: string, confirmName: string) {
    await apiDelete<ApiEnvelope<null>>(`/api/files/${fileId}`, { confirmName });
  },
  async listByGroup(groupId: string): Promise<FileItem[]> {
    const envelope = await apiGet<ApiEnvelope<{ files: FileItem[] }>>(`/api/groups/${groupId}/files`);
    return envelope.data?.files ?? [];
  },
};
