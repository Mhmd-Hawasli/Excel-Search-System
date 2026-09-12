import type { ApiEnvelope } from "@/types/api";
import type { CurrentUser } from "@/types/model";
import { apiFetch, apiPost } from "./api-client";

interface LoginResponse {
  ok: true;
  username: string;
}

export const authService = {
  async login(username: string, password: string): Promise<LoginResponse> {
    const envelope = await apiPost<ApiEnvelope<LoginResponse>>("/api/auth/login", { username, password });
    if (!envelope.data) throw new Error("لم يتم إرجاع بيانات المستخدم.");
    return envelope.data;
  },

  logout() {
    return apiPost<ApiEnvelope<null>>("/api/auth/logout");
  },

  me(): Promise<CurrentUser | null> {
    return apiFetch<CurrentUser>("/api/auth/me").catch(() => null);
  },
};
