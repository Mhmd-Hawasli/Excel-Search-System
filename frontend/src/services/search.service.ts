import type { ApiEnvelope } from "@/types/api";
import { apiGet } from "./api-client";

export interface SearchParams {
  q: string;
  mode?: string;
  field?: string;
  groupIds?: string[];
  fileIds?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: string;
}

export interface SearchRow {
  id: string;
  groupId: string;
  groupName: string;
  fileId: string;
  fileName: string;
  sfFullName: string | null;
  sfNationalId: string | null;
  dNationalId: string | null;
  sfMotherName: string | null;
  sfShamCash: string | null;
  sfPersonalNo: string | null;
  sfFirstName: string | null;
  sfFatherName: string | null;
  sfLastName: string | null;
  sfPhone: string | null;
  sfContractCode: string | null;
  sfSecondaryContractCode: string | null;
  sfJobTitle: string | null;
  sfFunctionalCategory: number | null;
  sfOrganizationalLevel: string | null;
  matchedField: string | null;
  matchedValue: string | null;
  matchRank: number;
}

export interface SearchResponse {
  rows: SearchRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export const searchService = {
  async search(params: SearchParams): Promise<SearchResponse> {
    const envelope = await apiGet<ApiEnvelope<SearchResponse>>("/api/search", {
      q: params.q,
      mode: params.mode ?? "full",
      field: params.field ?? "",
      // Repeated params: never comma-join (docs/05 A09).
      groupId: params.groupIds ?? [],
      fileId: params.fileIds ?? [],
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 25,
      sortBy: params.sortBy ?? "",
      sortDirection: params.sortDirection ?? "asc",
    });
    if (!envelope.data) throw new Error("تعذر تحميل نتائج البحث.");
    return envelope.data;
  },
};
