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

/**
 * Binary download reader (XLSX export, backup JSON). Ordinary JSON parsers
 * cannot consume these routes: assert type/disposition and parse content
 * separately (docs/05/09). Throws ApiError with the server Arabic message when
 * the server returns JSON error instead of bytes.
 */
export async function apiFetchBinary(
  path: string,
  init: RequestInit = {},
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
  if (contentType.includes("application/json")) {
    throw new ApiError("استجابة غير متوقعة: expected binary download.", response.status);
  }
  const blob = await response.blob();
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

export async function apiGet<T>(path: string, query: QueryMap = {}): Promise<T> {
  return apiFetch<T>(`${path}${buildQuery(query)}`);
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
