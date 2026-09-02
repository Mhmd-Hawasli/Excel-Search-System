import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { POST as logout } from "../logout/route";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { verifySessionToken } from "@/lib/auth/session";

beforeEach(() => {
  vi.stubEnv("ADMIN_USERNAME", "network-admin");
  vi.stubEnv("ADMIN_PASSWORD", "test-only-password");
  vi.stubEnv("SESSION_SECRET", undefined);
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());
const credentials = { username: "network-admin", password: "test-only-password" };
function request(url: string, body = credentials, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("network login", () => {
  it.each(["10.10.20.22", "192.168.1.33"])(
    "permits a valid login from client %s over HTTP in production",
    async (address) => {
      const response = await POST(
        request("http://10.10.20.131:3000/api/auth/login", credentials, {
          "x-forwarded-for": address,
        }),
      );
      expect(response.status).toBe(200);
      const cookie = response.cookies.get(SESSION_COOKIE)!;
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.secure).toBe(false);
      expect(await verifySessionToken(cookie.value)).toEqual({
        sub: "admin",
        username: "network-admin",
      });
    },
  );
  it.each(["username", "password"] as const)(
    "rejects an incorrect %s without setting a session",
    async (key) => {
      const response = await POST(
        request("http://10.10.20.131:3000/api/auth/login", { ...credentials, [key]: "wrong" }),
      );
      expect(response.status).toBe(401);
      expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
    },
  );
  it("retains secure cookies on HTTPS, including a TLS proxy", async () => {
    const direct = await POST(request("https://archive.test/api/auth/login"));
    const proxied = await POST(
      request("http://archive.test/api/auth/login", credentials, { "x-forwarded-proto": "https" }),
    );
    expect(direct.cookies.get(SESSION_COOKIE)?.secure).toBe(true);
    expect(proxied.cookies.get(SESSION_COOKIE)?.secure).toBe(true);
  });
  it("clears the HTTP session on logout", async () => {
    const response = await logout(
      new Request("http://10.10.20.131:3000/api/auth/logout", { method: "POST" }),
    );
    expect(response.cookies.get(SESSION_COOKIE)?.value).toBe("");
    expect(response.cookies.get(SESSION_COOKIE)?.maxAge).toBe(0);
    expect(response.cookies.get(SESSION_COOKIE)?.secure).toBe(false);
  });
});
