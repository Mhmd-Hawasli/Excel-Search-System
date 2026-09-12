import type { ApiEnvelope } from "@/types/api";
import type { DashboardData } from "@/types/model";
import { apiGet } from "./api-client";

export const dashboardService = {
  async get(): Promise<DashboardData> {
    const envelope = await apiGet<ApiEnvelope<DashboardData>>("/api/dashboard");
    if (!envelope.data) throw new Error("تعذر تحميل لوحة التحكم.");
    return envelope.data;
  },
};
