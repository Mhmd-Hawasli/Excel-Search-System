import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { BinaryLike } from "node:crypto";

function scryptAsync(password: BinaryLike, salt: BinaryLike, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keyLength,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 },
      (error, derived) => (error ? reject(error) : resolve(derived as Buffer)),
    );
  });
}

// Memory-hard parameters (interactive-login tuning). Stored alongside the
// hash so verification always uses the parameters the hash was created with.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function encode(hash: Buffer, salt: Buffer) {
  return `scrypt$v1$n=${SCRYPT_N}$r=${SCRYPT_R}$p=${SCRYPT_P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function decode(stored: string): { hash: Buffer; salt: Buffer } | null {
  const parts = stored.split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== "v1") return null;
  const params: Record<string, number> = {};
  for (const chunk of [parts[2], parts[3], parts[4]]) {
    const [name, raw] = chunk.split("=");
    const value = Number(raw);
    if (name === undefined || !Number.isInteger(value) || value <= 0) return null;
    params[name] = value;
  }
  if (params.n !== SCRYPT_N || params.r !== SCRYPT_R || params.p !== SCRYPT_P) return null;
  try {
    const salt = Buffer.from(parts[5], "base64");
    const hash = Buffer.from(parts[6], "base64");
    if (salt.length !== SALT_LENGTH || hash.length !== KEY_LENGTH) return null;
    return { hash, salt };
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return encode(hash, salt);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = decode(stored);
  if (!parsed) return false;
  const candidate = await scryptAsync(password, parsed.salt, KEY_LENGTH);
  return candidate.length === parsed.hash.length && timingSafeEqual(candidate, parsed.hash);
}
