import { apiGet, apiPost, buildQuery } from "./api-client";

export interface ConflictIssue {
  rule: string;
  label: string;
  explanation: string;
}

export interface ConflictRow {
  id: string;
  fileId: string;
  groupId: string;
  fileName: string;
  originalFilename: string;
  rowIndex: number;
  fullName: string;
  motherName: string;
  nationalId: string;
  shamCash: string;
  personalNo: string;
  phone: string;
  functionalCategory: number | null;
  groupKey: string | null;
  issueNumber: number;
  issues: ConflictIssue[];
}

export interface ConflictsResult {
  rows: ConflictRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface ConflictStatsRule {
  rule: string;
  label: string;
  category: string;
  instances: number;
  records: number;
}

export interface ConflictStatsFile {
  fileId: string;
  fileName: string;
  groupId: string;
  instances: number;
}

export interface ConflictStats {
  instances: number;
  records: number;
  filesScanned: number;
  recordsScanned: number;
  ignored: number;
  rules: ConflictStatsRule[];
  files: ConflictStatsFile[];
}

export interface ConflictFilters {
  category?: string;
  field?: string;
  rule?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: string;
}

export const conflictsService = {
  list(filters: ConflictFilters = {}): Promise<ConflictsResult> {
    const { category, field, rule, page, pageSize, sortBy, sortDir } = filters;
    return apiGet<ConflictsResult>("/api/conflicts", {
      category: category ?? "invalid",
      field: field ?? "all",
      rule: rule ?? "all",
      page: page ?? 1,
      pageSize: pageSize ?? 25,
      sortBy: sortBy ?? "issueNumber",
      sortDir: sortDir ?? "asc",
    });
  },
  stats(): Promise<ConflictStats> {
    return apiGet<ConflictStats>("/api/conflicts/stats");
  },
  ignore(rule: string, recordId: string): Promise<{ ok: boolean }> {
    return apiPost<{ ok: boolean }>("/api/conflicts/ignore", { rule, recordId });
  },
  exportUrl(filters: ConflictFilters = {}): string {
    const { category, field, rule, sortBy, sortDir } = filters;
    return `/api/conflicts/export${buildQuery({
      category: category ?? "invalid",
      field: field ?? "all",
      rule: rule ?? "all",
      sortBy: sortBy ?? "issueNumber",
      sortDir: sortDir ?? "asc",
    })}`;
  },
};
