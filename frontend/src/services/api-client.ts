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
