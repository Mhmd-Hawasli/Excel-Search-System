export const SESSION_COOKIE = "excel_archive_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 12;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set. حدد سرًا عشوائيًا طويلًا في .env.");
  }
  // Development fallback only: sessions expire with the process restart.
  return "excel-archive-search/dev-only-session-secret-change-me";
}

let signingKeyCache: { secret: string; key: Promise<CryptoKey> } | undefined;

export function getSessionSigningKey(): Promise<CryptoKey> {
  const secret = sessionSecret();
  if (signingKeyCache?.secret === secret) return signingKeyCache.key;
  // Web Crypto works in both middleware and Node. Derived once per secret, so
  // rotating SESSION_SECRET invalidates existing tokens.
  const key = (async () => {
    const encoder = new TextEncoder();
    const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, [
      "deriveKey",
    ]);
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: 210_000,
        salt: encoder.encode("excel-archive-search/session-signing/v1"),
      },
      material,
      { name: "HMAC", hash: "SHA-256", length: 256 },
      false,
      ["sign", "verify"],
    );
  })();
  signingKeyCache = { secret, key };
  return key;
}

export function sessionCookieOptions(request: Request) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(request.url).protocol === "https:" || forwardedProtocol === "https",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  };
}
