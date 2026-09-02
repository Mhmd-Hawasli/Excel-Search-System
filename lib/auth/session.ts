import { jwtVerify, SignJWT } from "jose";
import { getSessionSecret, SESSION_DURATION_SECONDS } from "@/lib/auth/config";

type SessionPayload = { sub: "admin"; username: string };

export async function createSessionToken(username: string) {
  return new SignJWT({ username } satisfies Omit<SessionPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), { algorithms: ["HS256"] });
    if (payload.sub !== "admin" || typeof payload.username !== "string") return null;
    return { sub: "admin", username: payload.username };
  } catch {
    return null;
  }
}
