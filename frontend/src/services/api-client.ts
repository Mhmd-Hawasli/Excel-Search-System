import type { ErrorBody, QueryMap } from "@/types/api";

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function buildQuery(query: QueryMap = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    // V1 search scope uses repeated groupId/fileId params (docs/05 A09):
    // arrays must append, never comma-join (which breaks UUID parsing).
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null || item === "") continue;
        params.append(key, String(item));
      }
      continue;
    }
    params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Centralized HTTP client. Only this module knows how to reach the backend. */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers,
  });

  const body = await parseBody(response);

  if (!response.ok) {
    const message =
      (body as ErrorBody | null)?.error ??
      (body as { message?: string } | null)?.message ??
      `تعذر إكمال الطلب (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return body as T;
}

/** Uploads a form with real byte progress; server processing may continue
 * after the upload reaches 100%. */
export function apiUploadForm<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.withCredentials = true;
    const abort = () => xhr.abort();
    if (signal?.aborted) {
      reject(new DOMException("تم إلغاء رفع الملف.", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    xhr.onloadend = () => signal?.removeEventListener("abort", abort);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0)
        onProgress?.(Math.min(99, Math.round(event.loaded / event.total * 100)));
    };
    xhr.upload.onload = () => onProgress?.(100);
    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        reject(new ApiError("استجابة غير صالحة من الخادم.", xhr.status));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const error = body as ErrorBody | null;
        reject(new ApiError(error?.error ?? `تعذر إكمال الطلب (${xhr.status}).`, xhr.status));
        return;
      }
      resolve(body as T);
    };
    xhr.onerror = () => reject(new Error("تعذر الاتصال بالخادم."));
    xhr.onabort = () => reject(new DOMException("تم إلغاء رفع الملف.", "AbortError"));
    xhr.send(form);
  });
}

/**
 * Binary download reader (XLSX export, backup JSON). Ordinary JSON parsers
 * cannot consume these routes: assert type/disposition and parse content
 * separately (docs/05/09). Throws ApiError with the server Arabic message when
 * the server returns JSON error instead of bytes.
 */
export async function apiFetchBinary(
  path: string,
  init: RequestInit = {},
  onProgress?: (receivedBytes: number, totalBytes: number | null) => void,
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await fetch(path, { credentials: "include", ...init });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    const body = await parseBody(response.clone()).catch(() => null);
    const message =
      (body as ErrorBody | null)?.error ??
      (body as { message?: string } | null)?.message ??
      `تعذر إكمال الطلب (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  // A backup is deliberately an application/json attachment. Treat JSON as
  // an unexpected API envelope only when no attachment disposition exists.
  if (contentType.includes("application/json") &&
      !response.headers.get("content-disposition")?.toLowerCase().includes("attachment")) {
    throw new ApiError("استجابة غير متوقعة: expected binary download.", response.status);
  }
  let blob: Blob;
  if (onProgress && response.body) {
    const reader = response.body.getReader();
    const totalHeader = Number(response.headers.get("content-length"));
    const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null;
    const chunks: ArrayBuffer[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
      copy.set(value);
      chunks.push(copy.buffer);
      received += value.byteLength;
      onProgress(received, total);
    }
    blob = new Blob(chunks, { type: contentType });
  } else {
    blob = await response.blob();
    onProgress?.(blob.size, blob.size);
  }
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename\*?=(?:UTF-8''?)?"?([^";]+)"?/i);
  return { blob, filename: match?.[1] ? decodeURIComponent(match[1]) : null };
}

/**
 * NDJSON stream reader (merge/run, sheet-merge upload/run/export). Preserves
 * event order, incremental progress, and split UTF-8/line boundaries; the
 * caller decides progress ranges and error termination (docs/04/05).
 * Never buffer the stream into one JSON response.
 */
export async function apiFetchNDJSON(
  path: string,
  init: RequestInit,
  onEvent: (event: unknown) => void,
): Promise<void> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, { credentials: "include", ...init, headers });
  if (!response.ok || !response.body) {
    const body = await parseBody(response.clone()).catch(() => null);
    const message =
      (body as ErrorBody | null)?.error ??
      (body as { message?: string } | null)?.message ??
      `تعذر إكمال الطلب (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      onEvent(JSON.parse(line));
    }
  }
  buffer += decoder.decode();
  const tail = buffer.trim();
  if (tail) onEvent(JSON.parse(tail));
}

export async function apiGet<T>(path: string, query: QueryMap = {}, init: RequestInit = {}): Promise<T> {
  return apiFetch<T>(`${path}${buildQuery(query)}`, init);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) });
}
