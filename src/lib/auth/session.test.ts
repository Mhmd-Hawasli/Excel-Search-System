import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionSigningKey } from "@/lib/auth/config";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

beforeEach(() => {
  vi.stubEnv("ADMIN_USERNAME", "network-admin");
  vi.stubEnv("ADMIN_PASSWORD", "test-only-password");
  vi.stubEnv("SESSION_SECRET", undefined);
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("credential-based sessions", () => {
  it("supports independent clients without SESSION_SECRET in production", async () => {
    const tokens = await Promise.all([
      createSessionToken("network-admin"),
      createSessionToken("network-admin"),
    ]);
    for (const token of tokens)
      expect(await verifySessionToken(token)).toEqual({ sub: "admin", username: "network-admin" });
  });
  it("rejects missing and tampered tokens", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("not-a-session")).toBeNull();
    const token = await createSessionToken("network-admin");
    const parts = token.split(".");
    parts[1] = Buffer.from(JSON.stringify({ sub: "admin", username: "intruder" })).toString(
      "base64url",
    );
    expect(await verifySessionToken(parts.join("."))).toBeNull();
  });
  it.each(["ADMIN_PASSWORD", "ADMIN_USERNAME"])(
    "invalidates sessions after changing %s",
    async (name) => {
      const token = await createSessionToken("network-admin");
      vi.stubEnv(name, "changed-credential");
      expect(await verifySessionToken(token)).toBeNull();
    },
  );
  it("rejects an expired signed token", async () => {
    const token = await new SignJWT({ username: "network-admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("admin")
      .setExpirationTime(1)
      .sign(await getSessionSigningKey());
    expect(await verifySessionToken(token)).toBeNull();
  });
});
