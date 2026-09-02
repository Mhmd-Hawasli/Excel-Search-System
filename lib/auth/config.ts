export const SESSION_COOKIE = "excel_archive_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 12;

export function getAdminCredentials() {
  return {
    username: process.env.ADMIN_USERNAME ?? "admin",
    password: process.env.ADMIN_PASSWORD ?? "admin123",
  };
}

let signingKeyCache: { credentials: string; key: Promise<CryptoKey> } | undefined;

export function getSessionSigningKey(): Promise<CryptoKey> {
  const { username, password } = getAdminCredentials();
  const credentials = JSON.stringify([username, password]);
  if (signingKeyCache?.credentials === credentials) return signingKeyCache.key;
  // Web Crypto works in both middleware and Node. Derive once per credential
  // pair, so login needs no separately configured secret and credential changes
  // invalidate existing tokens. Never put the password in the cookie payload.
  const key = (async () => {
    const encoder = new TextEncoder();
    const material = await crypto.subtle.importKey(
      "raw",
      encoder.encode(credentials),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
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
  signingKeyCache = { credentials, key };
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
