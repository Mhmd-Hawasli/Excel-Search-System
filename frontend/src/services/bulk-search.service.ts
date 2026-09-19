import { apiFetchBinary, apiFetchNDJSON, apiPost } from "./api-client";
import type { NdjsonEvent } from "./misc.service";

export interface BulkInspection {
  token: string;
  originalFilename: string;
  sheets: { name: string; rowCount: number }[];
  selected: {
    sheetName: string;
    headers: string[];
    preview: string[][];
    rowCount: number;
    columnCount: number;
  };
}

export interface BulkSheetSelection {
  sheetName: string;
  headers: string[];
  preview: string[][];
  rowCount: number;
  columnCount: number;
}

export interface BulkSearchRow {
  sequence: number;
  queryValue: string;
  field: string;
  groupName: string;
  fileName: string;
  rowIndex: number;
  fullName: string | null;
  nationalId: string | null;
  shamCash: string | null;
  personalNo: string | null;
  matchPercent: number;
}

export interface BulkSearchUnmatchedQuery {
  sequence: number;
  query: string;
}

export interface BulkSearchResult {
  field: string;
  totalValues: number;
  matchedValues: number;
  unmatchedValues: number;
  unmatchedQueries: BulkSearchUnmatchedQuery[];
  totalMatches: number;
  truncated: boolean;
  rows: BulkSearchRow[];
}

export interface BulkExportRow {
  sequence: number;
  queryValue: string;
  field: string;
  fileName: string;
  rowIndex: number;
  fullName: string | null;
  nationalId: string | null;
  shamCash: string | null;
  personalNo: string | null;
  matchPercent: number;
}

export interface BulkExportUnmatched {
  sequence: number;
  queryValue: string;
  field: string;
}

export interface BulkRunBody {
  token: string;
  sheetName: string;
  field: string;
  /** 0-based Excel column index holding the searched values. */
  column: number;
  /** Empty = all authorized files (same scope contract as single search). */
  groupIds?: string[];
  fileIds?: string[];
}

async function uploadInspection(file: File, onProgress?: (percent: number) => void): Promise<BulkInspection> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/bulk-search/inspect");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.upload.onload = () => onProgress?.(100);
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(body?.error ?? "تعذر فحص الملف."));
          return;
        }
        resolve(body.data ?? body);
      } catch {
        reject(new Error("تعذر فحص الملف."));
      }
    };
    xhr.onerror = () => reject(new Error("تعذر الاتصال بالخادم."));
    xhr.onabort = () => reject(new Error("تم إلغاء رفع الملف."));
    xhr.send(form);
  });
}

export const bulkSearchService = {
  inspect(file: File, onProgress?: (percent: number) => void): Promise<BulkInspection> {
    return uploadInspection(file, onProgress);
  },
  async sheet(token: string, sheet: string): Promise<BulkSheetSelection> {
    const response = await apiPost<{ data: BulkSheetSelection }>("/api/bulk-search/sheet", { token, sheet });
    return response.data;
  },
  run(
    body: BulkRunBody,
    onProgress: (percent: number, detail: string | null) => void,
    signal?: AbortSignal,
  ): Promise<BulkSearchResult> {
    return new Promise((resolve, reject) => {
      let payload: BulkSearchResult | null = null;
      apiFetchNDJSON(
        "/api/bulk-search/run",
        { method: "POST", body: JSON.stringify(body), signal },
        (event) => {
          const message = event as NdjsonEvent<BulkSearchResult>;
          if (message.type === "progress") onProgress(message.percent ?? 0, message.detail ?? null);
          else if (message.type === "result") {
            payload = message.payload;
            onProgress(100, null);
          } else if (message.type === "error") reject(new Error(message.error || "تعذر تنفيذ البحث الجماعي."));
        },
      )
        .then(() => {
          if (payload) resolve(payload);
          else reject(new Error("تعذر تنفيذ البحث الجماعي."));
        })
        .catch(reject);
    });
  },
  async downloadExport(rows: BulkExportRow[], unmatched: BulkExportUnmatched[], signal?: AbortSignal): Promise<void> {
    const { blob, filename } = await apiFetchBinary("/api/bulk-search/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows, unmatched }),
      signal,
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename ?? "bulk-search.xlsx";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
};
