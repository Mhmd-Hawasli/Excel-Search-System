import { jwtVerify, SignJWT } from "jose";
import {
  getAdminCredentials,
  getSessionSigningKey,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth/config";

type SessionPayload = { sub: "admin"; username: string };

export async function createSessionToken(username: string) {
  return new SignJWT({ username } satisfies Omit<SessionPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(await getSessionSigningKey());
}

export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await getSessionSigningKey(), {
      algorithms: ["HS256"],
    });
    if (payload.sub !== "admin" || payload.username !== getAdminCredentials().username) return null;
    return { sub: "admin", username: payload.username };
  } catch {
    return null;
  }
}
