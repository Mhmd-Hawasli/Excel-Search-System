import type { ApiEnvelope } from "@/types/api";
import type { Group, GroupFile } from "@/types/model";
import type { MutationResult } from "@/lib/mutation";
import { ApiError } from "./api-client";
import { apiDelete, apiGet, apiPatch, apiPost } from "./api-client";

function toMutationResult<T>(envelope: ApiEnvelope<T>, fallback: string): MutationResult {
  return { ok: true, message: envelope.message ?? fallback };
}

function mutationError(err: unknown, fallback: string): MutationResult {
  return { ok: false, error: err instanceof ApiError ? err.message : fallback };
}

export const groupsService = {
  async list(): Promise<Group[]> {
    const envelope = await apiGet<ApiEnvelope<{ groups: Group[] }>>("/api/groups");
    return envelope.data?.groups ?? [];
  },

  async get(id: string): Promise<{ group: Group; files: GroupFile[] }> {
    const envelope = await apiGet<ApiEnvelope<{ group: Group; files: GroupFile[] }>>(`/api/groups/${id}`);
    if (!envelope.data) throw new Error("غير موجود.");
    return envelope.data;
  },

  async create(formData: FormData): Promise<MutationResult> {
    try {
      const envelope = await apiPost<ApiEnvelope<{ group: Group }>>("/api/groups", {
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
      });
      if (!envelope.data) return { ok: false, error: "تعذر إنشاء المجموعة." };
      return toMutationResult(envelope, "تم إنشاء المجموعة.");
    } catch (err) {
      return mutationError(err, "تعذر إنشاء المجموعة.");
    }
  },

  async update(formData: FormData): Promise<MutationResult> {
    const id = String(formData.get("id") ?? "");
    try {
      const envelope = await apiPatch<ApiEnvelope<{ group: Group }>>(`/api/groups/${id}`, {
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
      });
      if (!envelope.data) return { ok: false, error: "تعذر حفظ التعديلات." };
      return toMutationResult(envelope, "تم حفظ تعديلات المجموعة.");
    } catch (err) {
      return mutationError(err, "تعذر حفظ التعديلات.");
    }
  },

  async reorder(formData: FormData): Promise<MutationResult> {
    const id = String(formData.get("id") ?? "");
    try {
      const envelope = await apiPost<ApiEnvelope<null>>(`/api/groups/${id}/reorder`, {
        id,
        direction: String(formData.get("direction") ?? ""),
      });
      return toMutationResult(envelope, "تم حفظ ترتيب المجموعات.");
    } catch (err) {
      return mutationError(err, "تعذر حفظ ترتيب المجموعات.");
    }
  },

  async remove(formData: FormData): Promise<MutationResult> {
    const id = String(formData.get("id") ?? "");
    try {
      const envelope = await apiDelete<ApiEnvelope<null>>(`/api/groups/${id}`, {
        id,
        confirmName: String(formData.get("confirmName") ?? ""),
      });
      return toMutationResult(envelope, "تم حذف المجموعة وكل ملفاتها وسجلاتها.");
    } catch (err) {
      return mutationError(err, "تعذر حذف المجموعة.");
    }
  },
};
