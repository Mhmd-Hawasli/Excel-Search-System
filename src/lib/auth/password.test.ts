import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the correct password and rejects wrong ones", async () => {
    const stored = await hashPassword("mhmd123");
    expect(await verifyPassword("mhmd123", stored)).toBe(true);
    expect(await verifyPassword("mhmd124", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });
  it("uses a random salt for every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("mhmd123", "not-a-hash")).toBe(false);
    expect(await verifyPassword("mhmd123", "scrypt$v1$n=1$r=1$p=1$AA$BB")).toBe(false);
    expect(await verifyPassword("mhmd123", "")).toBe(false);
  });
});
