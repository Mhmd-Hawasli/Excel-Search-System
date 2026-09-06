import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionSigningKey } from "@/lib/auth/config";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

const USER_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-only-session-secret-at-least-32-chars");
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("user sessions", () => {
  it("round-trips a user id and username", async () => {
    const token = await createSessionToken(USER_ID, "mhmd");
    expect(await verifySessionToken(token)).toEqual({ userId: USER_ID, username: "mhmd" });
  });
  it("rejects missing and tampered tokens", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("not-a-session")).toBeNull();
    const token = await createSessionToken(USER_ID, "mhmd");
    const parts = token.split(".");
    parts[1] = Buffer.from(JSON.stringify({ sub: USER_ID, username: "intruder" })).toString(
      "base64url",
    );
    expect(await verifySessionToken(parts.join("."))).toBeNull();
  });
  it("invalidates sessions after rotating SESSION_SECRET", async () => {
    const token = await createSessionToken(USER_ID, "mhmd");
    vi.stubEnv("SESSION_SECRET", "a-completely-different-test-secret-1234");
    expect(await verifySessionToken(token)).toBeNull();
  });
  it("rejects an expired signed token", async () => {
    const token = await new SignJWT({ username: "mhmd" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER_ID)
      .setExpirationTime(1)
      .sign(await getSessionSigningKey());
    expect(await verifySessionToken(token)).toBeNull();
  });
  it("requires SESSION_SECRET in production", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    await expect(createSessionToken(USER_ID, "mhmd")).rejects.toThrow("SESSION_SECRET");
  });
});
