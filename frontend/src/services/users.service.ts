import type { ApiEnvelope } from "@/types/api";
import type { CurrentUser } from "@/types/model";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./api-client";

export interface PermissionRow {
  permission: string;
  groupId: string | null;
  fileId: string | null;
}

export interface ManagedUser {
  id: string;
  username: string;
  displayName: string | null;
  isActive: boolean;
  createdAt: string;
  permissions: PermissionRow[];
}

export const usersService = {
  async list(): Promise<ManagedUser[]> {
    const envelope = await apiGet<ApiEnvelope<{ users: ManagedUser[] }>>("/api/users");
    return envelope.data?.users ?? [];
  },
  async create(body: {
    username: string;
    password: string;
    displayName?: string;
    isActive: boolean;
    permissions: PermissionRow[];
  }): Promise<{ user: ManagedUser }> {
    const envelope = await apiPost<ApiEnvelope<{ user: ManagedUser }>>("/api/users", body);
    if (!envelope.data) throw new Error("تعذر إنشاء المستخدم.");
    return envelope.data;
  },
  async update(
    id: string,
    body: { displayName?: string; isActive?: boolean; password?: string },
  ): Promise<{ user: ManagedUser }> {
    const envelope = await apiPatch<ApiEnvelope<{ user: ManagedUser }>>(`/api/users/${id}`, body);
    if (!envelope.data) throw new Error("تعذر حفظ التعديلات.");
    return envelope.data;
  },
  async remove(id: string): Promise<void> {
    await apiDelete<ApiEnvelope<null>>(`/api/users/${id}`);
  },
  async replacePermissions(id: string, permissions: PermissionRow[]): Promise<{ permissions: PermissionRow[] }> {
    const envelope = await apiPut<
      ApiEnvelope<{ userId: string; username: string; permissions: PermissionRow[] }>
    >(`/api/users/${id}/permissions`, { permissions });
    if (!envelope.data) throw new Error("تعذر حفظ الصلاحيات.");
    return { permissions: envelope.data.permissions };
  },
};

export type { CurrentUser };
