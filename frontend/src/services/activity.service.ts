import { apiGet } from "./api-client";

export interface ActivityLogItem {
  id: string;
  /** PascalCase action name from the backend (e.g. FileUploaded). */
  action: string;
  targetName: string;
  /** Username of the user who performed the action; null for background events. */
  actor: string | null;
  details: Record<string, string | number | null>;
  createdAt: string;
  /** File context enriched by the backend (historical name when stored,
   *  otherwise resolved via fileId; null for file-less events or deleted
   *  files without a stored name). Old rows simply carry nulls. */
  fileName?: string | null;
  /** Version at event time when stored, otherwise the file's current
   *  version; null when unknown. */
  fileVersion?: number | null;
}

export interface ActivityPage {
  items: ActivityLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Server window size for full-history loads (backend clamps to 1000). */
export const ACTIVITY_FETCH_PAGE_SIZE = 1000;
/** Rows shown per logs page (client-side pagination). */
export const ACTIVITY_PAGE_SIZE = 100;

export const activityService = {
  list(action?: string, page = 1, pageSize = ACTIVITY_FETCH_PAGE_SIZE): Promise<ActivityPage> {
    return apiGet<ActivityPage>("/api/activity", { action, page, pageSize });
  },

  /** Loads the whole history (newest first) by walking server pages until
   *  `total` is reached. Keeps every existing filter working over the full
   *  dataset instead of only the first window. */
  async listAll(action?: string): Promise<ActivityPage> {
    const first = await this.list(action, 1, ACTIVITY_FETCH_PAGE_SIZE);
    const items = [...first.items];
    const total = first.total;
    const totalPages = Math.ceil(total / first.pageSize);
    for (let page = 2; page <= totalPages; page += 1) {
      // eslint-disable-next-line no-await-in-loop
      const next = await this.list(action, page, ACTIVITY_FETCH_PAGE_SIZE);
      items.push(...next.items);
      if (items.length >= next.total) break;
    }
    return { items, total, page: 1, pageSize: items.length };
  },
};
