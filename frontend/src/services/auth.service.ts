import type { ApiEnvelope } from "@/types/api";
import type { CurrentUser } from "@/types/model";
import { apiFetch, apiPost } from "./api-client";

interface LoginResponse {
  ok: true;
  username: string;
}

export const authService = {
  async login(username: string, password: string): Promise<LoginResponse> {
    const envelope = await apiPost<ApiEnvelope<LoginResponse>>("/api/auth/login", { username, password });
    if (!envelope.data) throw new Error("لم يتم إرجاع بيانات المستخدم.");
    return envelope.data;
  },

  logout() {
    meCache = null;
    return apiPost<ApiEnvelope<null>>("/api/auth/logout");
  },

  me(signal?: AbortSignal): Promise<CurrentUser | null> {
    // Short-lived memo: AuthGuard + every protected page call me() on each
    // navigation (2-3 identical requests per route change). Coalesce to one
    // flight and reuse for 15s. Backend stays authoritative per request;
    // this only trims redundant session reads, never permissions.
    // NOTE: the caller's signal is never wired into the shared flight — an
    // unmounting component must not abort the session read other pages share
    // (that surfaced as phantom logouts). It only rejects that caller.
    const now = Date.now();
    if (!meCache || now - meCache.at >= ME_TTL_MS) {
      const promise: Promise<CurrentUser | null> = apiFetch<CurrentUser>("/api/auth/me").catch(() => null);
      meCache = { at: now, promise };
      // Failed (logged-out) results must not linger: clear so the next
      // navigation re-checks immediately after logout/login transitions.
      void promise.then((user) => {
        if (user === null) meCache = null;
      });
    }
    const shared = meCache.promise;
    if (!signal) return shared;
    if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    return new Promise<CurrentUser | null>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener("abort", onAbort);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      shared.then(
        (user) => {
          signal.removeEventListener("abort", onAbort);
          resolve(user);
        },
        (err) => {
          signal.removeEventListener("abort", onAbort);
          reject(err);
        },
      );
    });
  },
};

const ME_TTL_MS = 15_000;

let meCache: { at: number; promise: Promise<CurrentUser | null> } | null = null;
