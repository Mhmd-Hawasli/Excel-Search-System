import { apiFetchBinary, apiFetchNDJSON, apiPost, buildQuery } from "./api-client";

export const backupService = {
  exportUrl: "/api/backup/export",
  restore(file: File) {
    const form = new FormData();
    form.append("file", file);
    return fetch("/api/backup/restore", { method: "POST", body: form, credentials: "include" }).then(async (r) => {
      if (!r.ok) throw new Error("فشلت الاستعادة.");
      return r.json();
    });
  },
};

// ---- Two-file merge (docs/05 A22–A26, docs/07.7) ----

export const MERGE_FIELD_KEYS = [
  "fullName",
  "firstName",
  "fatherName",
  "lastName",
  "motherName",
  "nationalId",
  "personalNo",
  "shamCash",
  "phone",
] as const;

export type MergeFieldKey = (typeof MERGE_FIELD_KEYS)[number];

export const MERGE_FIELD_LABELS: Record<MergeFieldKey, string> = {
  fullName: "الاسم الثلاثي",
  firstName: "الاسم",
  fatherName: "اسم الأب",
  lastName: "النسبة",
  motherName: "اسم الأم",
  nationalId: "الرقم الوطني",
  personalNo: "الرقم الذاتي",
  shamCash: "الشام كاش",
  phone: "رقم الهاتف",
};

export interface MergeInspection {
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
  suggestedMapping?: Record<string, number>;
}

export interface MergeSheetSelection {
  sheetName: string;
  headers: string[];
  preview: string[][];
  rowCount: number;
  columnCount: number;
  suggestedMapping?: Record<string, number>;
}

export interface MergePair {
  key: string;
  rule: string;
  leftRowNumber: number;
  rightRowNumber: number;
  confirmed: boolean;
  leftValue: string;
  rightValue: string;
}

export interface MergeRuleStat {
  key: string;
  order: number;
  label: string;
  description: string;
  available: boolean;
  reason: string | null;
  matchedPairs: number;
  pairs: MergePair[];
}

export interface MergeRunResult {
  sessionId: string;
  leftHeaders: string[];
  rightHeaders: string[];
  ignoreConfirmation: boolean;
  left: { rowNumber: number; cells: string[]; key: string | null; rule: string | null; confirmed: boolean }[];
  right: { rowNumber: number; cells: string[]; key: string | null; rule: string | null; confirmed: boolean }[];
  pairs: MergePair[];
  rules: MergeRuleStat[];
  status: { state: string; matchedPairs: number; total: number; percent: number };
}

export type NdjsonEvent<T> =
  | { type: "progress"; percent: number; detail?: string | null }
  | { type: "result"; payload: T }
  | { type: "ready"; payload: T }
  | { type: "error"; error: string };

async function uploadInspection(url: string, file: File, onProgress?: (percent: number) => void): Promise<MergeInspection> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(99, Math.round(event.loaded / event.total * 100)));
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

export const mergeService = {
  inspect(file: File, onProgress?: (percent: number) => void): Promise<MergeInspection> {
    return uploadInspection("/api/merge/inspect", file, onProgress);
  },
  async sheet(token: string, sheet: string): Promise<MergeSheetSelection> {
    const response = await apiPost<{ data: MergeSheetSelection }>("/api/merge/sheet", { token, sheet });
    return response.data;
  },
  run(
    body: { left: { token: string; sheetName: string; mapping: Record<string, number> }; right: { token: string; sheetName: string; mapping: Record<string, number> }; ignoreConfirmation: boolean },
    onProgress: (percent: number, detail: string | null) => void,
  ): Promise<MergeRunResult> {
    return new Promise((resolve, reject) => {
      let payload: MergeRunResult | null = null;
      apiFetchNDJSON(
        "/api/merge/run",
        { method: "POST", body: JSON.stringify(body) },
        (event) => {
          const message = event as NdjsonEvent<MergeRunResult>;
          if (message.type === "progress") onProgress(message.percent ?? 0, message.detail ?? null);
          else if (message.type === "result") {
            payload = message.payload;
            onProgress(100, null);
          } else if (message.type === "error") reject(new Error(message.error || "تعذر تنفيذ الدمج."));
        },
      )
        .then(() => {
          if (payload) resolve(payload);
          else reject(new Error("تعذر تنفيذ الدمج."));
        })
        .catch(reject);
    });
  },
  async deleteKey(sessionId: string, table: string, rowNumber: number): Promise<MergeRunResult> {
    const response = await apiPost<{ data: MergeRunResult }>("/api/merge/key", { sessionId, table, rowNumber });
    return response.data;
  },
  exportUrl(sessionId: string, scope: "confirmed" | "all"): string {
    return `/api/merge/export${buildQuery({ sessionId, scope })}`;
  },
  async downloadExport(sessionId: string, scope: "confirmed" | "all"): Promise<void> {
    const { blob, filename } = await apiFetchBinary(mergeService.exportUrl(sessionId, scope));
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename ?? "merge.xlsx";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
  prepareExport(
    sessionId: string,
    scope: "confirmed" | "all",
    onProgress: (percent: number, detail: string | null) => void,
  ): Promise<MergeExportReady> {
    return ndjsonPost<MergeExportReady>("/api/merge/export/prepare", { sessionId, scope }, onProgress);
  },
  async download(downloadId: string, filename: string, onProgress: (percent: number) => void): Promise<void> {
    await downloadBinaryFile(
      `/api/merge/download?id=${encodeURIComponent(downloadId)}`,
      filename,
      onProgress,
    );
  },
};

export interface MergeExportReady {
  downloadId: string;
  filename: string;
  size: number;
}

/** Shared chunked binary downloader with progress (merge + sheet-merge exports). */
export async function downloadBinaryFile(
  url: string,
  filename: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new Error(payload?.error ?? payload?.message ?? "تعذر تنزيل الملف.");
  }
  const total = Number(response.headers.get("content-length") ?? 0);
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      received += value.length;
      if (total) onProgress(Math.min(99, Math.round((received / total) * 100)));
    }
  } else {
    const whole = new Uint8Array(await response.arrayBuffer());
    chunks.push(whole);
    received = whole.length;
  }
  onProgress(100);
  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  const blob = new Blob([combined.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

// ---- Sheet merge (docs/05 A27–A30, docs/07.8) ----

export interface SheetMergeSheetInfo {
  name: string;
  hidden: boolean;
  rowCount: number;
  columnCount: number;
  firstColumnHeader: string | null;
  filtersRemoved: boolean;
  linkable: boolean;
  reason: string | null;
}

export interface SheetMergeInspection {
  uploadId: string;
  originalFilename: string;
  sheetCount: number;
  sheets: SheetMergeSheetInfo[];
  main: { name: string; headers: string[]; preview: string[][]; rowCount: number };
  suggestion: { index: number | null; reason: string | null };
}

export interface SheetMergeUnlinked {
  rowNumber: number;
  value: string;
  reason: string;
  cells: string[];
}

export interface SheetMergeSheetResult {
  sheetName: string;
  role: string;
  headers: string[];
  unlinkedHeaders: string[];
  rowCount: number;
  linkedCount: number;
  percent: number;
  validKeyCount: number;
  invalidCount: number;
  duplicateCount: number;
  missingCount: number;
  unlinkedTotal: number;
  unlinked: SheetMergeUnlinked[];
}

export interface SheetMergeRunResult {
  sessionId: string;
  originalFilename: string;
  mainSheetName: string;
  nationalIdColumn: number;
  nationalIdHeader: string;
  exportHeaders: string[];
  exportRowCount: number;
  linkPercent: number;
  sheets: SheetMergeSheetResult[];
}

export interface SheetMergeExportReady {
  downloadId: string;
  filename: string;
  size: number;
  sheetCount: number;
}

function ndjsonPost<T>(url: string, body: unknown, onProgress: (percent: number, detail: string | null) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let payload: T | null = null;
    apiFetchNDJSON(url, { method: "POST", body: JSON.stringify(body) }, (event) => {
      const message = event as NdjsonEvent<T>;
      if (message.type === "progress") onProgress(message.percent ?? 0, message.detail ?? null);
      else if (message.type === "result" || message.type === "ready") {
        payload = message.payload;
        onProgress(100, null);
      } else if (message.type === "error") reject(new Error(message.error || "تعذر تنفيذ الطلب."));
    })
      .then(() => {
        if (payload) resolve(payload);
        else reject(new Error("تعذر تنفيذ الطلب."));
      })
      .catch(reject);
  });
}

export const sheetMergeService = {
  upload(file: File, onProgress: (percent: number, detail: string | null) => void): Promise<SheetMergeInspection> {
    // fetch cannot report upload bytes, so XHR carries the file while the
    // server-side parsing percentage streams back as NDJSON (V1 client.ts).
    // Reported: 0–49% bytes on the wire, 50–100% server parsing.
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.set("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/sheet-merge/upload");
      const state: { inspection: SheetMergeInspection | null; failure: string | null } = {
        inspection: null,
        failure: null,
      };
      let lineStart = 0;
      const handle = (line: string) => {
        let message: NdjsonEvent<SheetMergeInspection>;
        try {
          message = JSON.parse(line) as NdjsonEvent<SheetMergeInspection>;
        } catch {
          return;
        }
        if (message.type === "progress") {
          onProgress(50 + Math.round((message.percent ?? 0) / 2), message.detail ?? null);
        } else if (message.type === "ready") {
          state.inspection = message.payload;
          onProgress(100, "اكتمل رفع الملف.");
        } else if (message.type === "error") {
          state.failure = message.error;
        }
      };
      const drain = () => {
        const text = xhr.responseText;
        let newline = text.indexOf("\n", lineStart);
        while (newline >= 0) {
          const line = text.slice(lineStart, newline).trim();
          lineStart = newline + 1;
          if (line) handle(line);
          newline = text.indexOf("\n", lineStart);
        }
      };
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          onProgress(Math.min(49, Math.round((event.loaded / event.total) * 49)), "جارٍ رفع الملف إلى الخادم…");
      };
      xhr.onprogress = () => drain();
      xhr.onload = () => {
        drain();
        if (state.inspection && xhr.status >= 200 && xhr.status < 300) {
          resolve(state.inspection);
          return;
        }
        let message = state.failure;
        if (!message) {
          try {
            message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? null;
          } catch {
            // Keep the generic message below.
          }
        }
        reject(new Error(message ?? "تعذر فحص الملف."));
      };
      xhr.onerror = () => reject(new Error("تعذر الاتصال بالخادم."));
      xhr.send(form);
    });
  },
  run(
    body: { uploadId: string; nationalIdColumn: number; sheetNames: string[] },
    onProgress: (percent: number, detail: string | null) => void,
  ): Promise<SheetMergeRunResult> {
    return ndjsonPost<SheetMergeRunResult>("/api/sheet-merge/run", body, onProgress);
  },
  prepareExport(sessionId: string, onProgress: (percent: number, detail: string | null) => void): Promise<SheetMergeExportReady> {
    return ndjsonPost<SheetMergeExportReady>("/api/sheet-merge/export", { sessionId }, onProgress);
  },
  async download(downloadId: string, filename: string, onProgress: (percent: number) => void): Promise<void> {
    const response = await fetch(`/api/sheet-merge/download?id=${encodeURIComponent(downloadId)}`, {
      credentials: "include",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "تعذر تنزيل الملف.");
    }
    const total = Number(response.headers.get("content-length") ?? 0);
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        received += value.length;
        if (total) onProgress(Math.min(99, Math.round((received / total) * 100)));
      }
    } else {
      const whole = new Uint8Array(await response.arrayBuffer());
      chunks.push(whole);
      received = whole.length;
    }
    onProgress(100);
    const combined = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    const blob = new Blob([combined.buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
};
