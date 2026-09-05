import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The singleton proxies construction until first use; exercises the cache +
 * validation behavior with a stubbed adapter without touching PostgreSQL.
 */
vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    connectionString;
    constructor(options: { connectionString: string }) {
      this.connectionString = options.connectionString;
    }
  },
}));

describe("prisma singleton", () => {
  const originalUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
    vi.resetModules();
  });

  it("defers construction until first access", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    const { prisma } = await import("@/lib/db/prisma");
    // Importing must not throw even without a database — the proxy defers.
    expect(prisma).toBeDefined();
  });

  it("explains the missing DATABASE_URL on first use", async () => {
    delete process.env.DATABASE_URL;
    const { prisma } = await import("@/lib/db/prisma");
    await expect(async () => Reflect.get(prisma, "group")).rejects.toThrow(/DATABASE_URL/);
  });
});
