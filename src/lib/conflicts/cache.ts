import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

type Reader = Pick<Prisma.TransactionClient, "$queryRaw">;
type CacheDatabase = Pick<typeof prisma, "$queryRaw" | "$transaction">;
const CACHE_FORMAT = "conflicts-v1";
const MAX_ENTRIES = 128;
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;

/** SQL + bound values include every filter, scope and rule/explanation definition. */
export function conflictQueryCacheKey(query: Prisma.Sql): string {
  return createHash("sha256")
    .update(JSON.stringify([CACHE_FORMAT, query.sql, query.values]))
    .digest("hex");
}

async function readCurrent<T>(key: string, database: Reader): Promise<T[] | undefined> {
  // One statement snapshot: no gap between checking the revision and reading payload.
  const [hit] = await database.$queryRaw<{ payload: T[] }[]>(Prisma.sql`
    SELECT c.payload FROM conflict_query_cache c
    JOIN conflict_cache_state s ON s.id = 1 AND s.revision = c.source_revision
    WHERE c.key = ${key} AND c.checked_date = CURRENT_DATE
  `);
  return hit?.payload;
}

/**
 * Persistent, revision-checked cache. Never serves stale data as a fallback.
 * Writes to source tables increment the revision in their own transaction.
 * A per-key DB lock coalesces simultaneous misses across application processes.
 */
export async function queryWithConflictCache<T>(
  query: Prisma.Sql,
  database: CacheDatabase = prisma,
): Promise<T[]> {
  const key = conflictQueryCacheKey(query);
  const hit = await readCurrent<T>(key, database);
  if (hit !== undefined) return hit;

  return database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      // READ COMMITTED rechecks after waiting for another builder to finish.
      const existing = await readCurrent<T>(key, tx);
      if (existing !== undefined) return existing;
      const [source] = await tx.$queryRaw<{ revision: string; day: string }[]>`
      SELECT revision::text AS revision, CURRENT_DATE::text AS day FROM conflict_cache_state WHERE id = 1
    `;
      if (!source)
        throw new Error("Conflict cache revision is missing. Apply database migrations.");
      const rows = await tx.$queryRaw<T[]>(query);
      const payload = JSON.stringify(rows);
      if (Buffer.byteLength(payload, "utf8") <= MAX_PAYLOAD_BYTES) {
        // Keep the BEFORE-query revision, never a newer revision read after the scan.
        // If a write committed during calculation, this insert is skipped entirely.
        await tx.$executeRaw`
        INSERT INTO conflict_query_cache (key, source_revision, checked_date, payload, rebuilt_at)
        SELECT ${key}, ${source.revision}::bigint, ${source.day}::date, ${payload}::jsonb, clock_timestamp()
        FROM conflict_cache_state WHERE id = 1 AND revision = ${source.revision}::bigint
          AND CURRENT_DATE = ${source.day}::date
        ON CONFLICT (key) DO UPDATE SET source_revision = EXCLUDED.source_revision,
          checked_date = EXCLUDED.checked_date, payload = EXCLUDED.payload, rebuilt_at = EXCLUDED.rebuilt_at
      `;
        // Bound persisted storage; never delete source data.
        await tx.$executeRaw`
        DELETE FROM conflict_query_cache WHERE key IN (
          SELECT key FROM conflict_query_cache ORDER BY rebuilt_at DESC, key OFFSET ${MAX_ENTRIES}
        ) OR checked_date < CURRENT_DATE
      `;
      }
      return rows;
    },
    { isolationLevel: "ReadCommitted", maxWait: 60_000, timeout: 180_000 },
  );
}
