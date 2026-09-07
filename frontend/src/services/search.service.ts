import type { PageResult } from "@/types/api";
import type { SearchResult } from "@/types/model";
import { apiGet } from "./api-client";

export interface SearchParams {
  q: string;
  mode?: string;
  field?: string;
  groupIds?: string[];
  fileIds?: string[];
  page?: number;
  pageSize?: number;
}

export const searchService = {
  search(params: SearchParams): Promise<PageResult<SearchResult>> {
    return apiGet<PageResult<SearchResult>>("/api/search", {
      q: params.q,
      mode: params.mode ?? "full",
      field: params.field ?? "",
      groupIds: params.groupIds?.join(","),
      fileIds: params.fileIds?.join(","),
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 25,
    });
  },
};
