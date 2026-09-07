import type { ApiEnvelope } from "@/types/api";
import type { CurrentUser } from "@/types/model";
import { apiGet } from "./api-client";

export const usersService = {
  async list(): Promise<CurrentUser[]> {
    const envelope = await apiGet<ApiEnvelope<{ users: CurrentUser[] }>>("/api/users");
    return envelope.data?.users ?? [];
  },
};
