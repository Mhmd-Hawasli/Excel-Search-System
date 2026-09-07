import type { ApiEnvelope } from "@/types/api";
import type { Group } from "@/types/model";
import { apiDelete, apiGet, apiPatch, apiPost } from "./api-client";

export const groupsService = {
  async list(): Promise<Group[]> {
    const envelope = await apiGet<ApiEnvelope<{ groups: Group[] }>>("/api/groups");
    return envelope.data?.groups ?? [];
  },
  async create(name: string, description = ""): Promise<Group> {
    const envelope = await apiPost<ApiEnvelope<{ group: Group }>>("/api/groups", { name, description });
    if (!envelope.data) throw new Error("تعذر إنشاء المجموعة.");
    return envelope.data.group;
  },
  async update(id: string, name: string, description = ""): Promise<Group> {
    const envelope = await apiPatch<ApiEnvelope<{ group: Group }>>(`/api/groups/${id}`, { name, description });
    if (!envelope.data) throw new Error("تعذر تحديث المجموعة.");
    return envelope.data.group;
  },
  async reorder(id: string, direction: "up" | "down"): Promise<void> {
    await apiPost<ApiEnvelope<null>>(`/api/groups/${id}/reorder`, { id, direction });
  },
  async remove(id: string, confirmName: string): Promise<void> {
    await apiDelete<ApiEnvelope<null>>(`/api/groups/${id}`, { id, confirmName });
  },
};
