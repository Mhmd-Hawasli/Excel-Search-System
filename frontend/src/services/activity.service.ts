import { apiGet } from "./api-client";

export interface ActivityLogItem {
  id: string;
  /** PascalCase action name from the backend (e.g. FileUploaded). */
  action: string;
  targetName: string;
  details: Record<string, string | number | null>;
  createdAt: string;
}

export interface ActivityPage {
  items: ActivityLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const activityService = {
  list(action?: string): Promise<ActivityPage> {
    return apiGet<ActivityPage>("/api/activity", { action, page: 1, pageSize: 500 });
  },
};
