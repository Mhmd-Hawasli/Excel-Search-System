import { jwtVerify, SignJWT } from "jose";
import { getSessionSigningKey, SESSION_DURATION_SECONDS } from "@/lib/auth/config";

export type SessionPayload = { userId: string; username: string };

export async function createSessionToken(userId: string, username: string) {
  return new SignJWT({ username } satisfies Omit<SessionPayload, "userId">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(await getSessionSigningKey());
}

export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await getSessionSigningKey(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || typeof payload.username !== "string") return null;
    return { userId: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}
