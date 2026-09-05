"use client";

/**
 * Client-side transport of the "دمج صفحات ملف اكسيل" section: real percentage
 * progress for the three operations (upload, processing, export) using the
 * NDJSON streams of its own API routes. Isolated — it talks only to
 * `/api/sheet-merge/*`.
 */

import type { UploadInspection } from "@/lib/sheet-merge/types";

export type ExportReady = {
  downloadId: string;
  filename: string;
  size: number;
  sheetCount: number;
};

type StreamMessage<T> = {
  type?: "progress" | "ready" | "result";
  percent?: number;
  detail?: string | null;
  payload?: T;
  error?: string;
};

/** Reads an NDJSON response, reporting progress and returning the payload. */
export async function postNdJson<T>(
  url: string,
  body: unknown,
  onProgress: (percent: number, detail: string | null) => void,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("ndjson")) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "تعذر تنفيذ الطلب.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("تعذر تنفيذ الطلب.");
  const decoder = new TextDecoder();
  let buffer = "";
  let payload: T | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        const message = JSON.parse(line) as StreamMessage<T>;
        if (message.type === "progress") onProgress(message.percent ?? 0, message.detail ?? null);
        else if (message.payload !== undefined) {
          payload = message.payload;
          onProgress(100, null);
        } else throw new Error(message.error ?? "تعذر تنفيذ الطلب.");
      }
      newline = buffer.indexOf("\n");
    }
  }
  if (!payload) throw new Error("تعذر تنفيذ الطلب.");
  return payload;
}

/**
 * Uploads the workbook with real byte progress. `fetch` cannot report upload
 * progress, so XHR is used — and because the route answers with streamed
 * NDJSON, the server-side parsing percentage is read incrementally from
 * `responseText` as it arrives.
 *
 * Reported percentage: 0–49% = bytes on the wire, 50–100% = server parsing.
 */
export function uploadWorkbookWithProgress(
  file: File,
  onProgress: (percent: number, detail: string | null) => void,
): Promise<UploadInspection> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/sheet-merge/upload");
    const state: { inspection: UploadInspection | null; failure: string | null } = {
      inspection: null,
      failure: null,
    };
    let lineStart = 0;

    const handle = (line: string) => {
      let message: StreamMessage<UploadInspection>;
      try {
        message = JSON.parse(line) as StreamMessage<UploadInspection>;
      } catch {
        return;
      }
      if (message.type === "progress") {
        onProgress(50 + Math.round((message.percent ?? 0) / 2), message.detail ?? null);
      } else if (message.type === "ready" && message.payload) {
        state.inspection = message.payload;
        onProgress(100, "اكتمل رفع الملف.");
      } else if (message.error) {
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
        onProgress(
          Math.min(49, Math.round((event.loaded / event.total) * 49)),
          "جارٍ رفع الملف إلى الخادم…",
        );
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
}

/**
 * Downloads the prepared workbook while reporting a real percentage from
 * `content-length`, then hands the file to the browser.
 */
export async function downloadPreparedExport(
  downloadId: string,
  filename: string,
  onProgress: (percent: number) => void,
) {
  const response = await fetch(`/api/sheet-merge/download?id=${encodeURIComponent(downloadId)}`);
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
}
