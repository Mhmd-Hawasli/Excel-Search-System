import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Builds the Prisma client. Prisma 7 talks to PostgreSQL through the `pg`
 * driver adapter, so the connection string is validated in one place instead
 * of being read by every caller.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. انسخ .env.example إلى .env وحدد اتصال قاعدة البيانات.");
  }
  const adapter = new PrismaPg({
    connectionString,
    // Optional override; set DATABASE_POOL_MAX=1 for single-session local
    // databases such as the PGlite dev server (scripts/dev-postgres.mjs).
    max: process.env.DATABASE_POOL_MAX ? Number(process.env.DATABASE_POOL_MAX) : undefined,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function instantiate(): PrismaClient {
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

/**
 * Singleton Prisma client (one per process, reused across HMR in development).
 *
 * Construction is deferred to first use so that importing modules that depend
 * on the database (workers, services) never fails in environments without a
 * configured `DATABASE_URL` — e.g. unit tests that only exercise pure logic.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = globalForPrisma.prisma ?? instantiate();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, property) {
    return Reflect.has(globalForPrisma.prisma ?? instantiate(), property);
  },
});
