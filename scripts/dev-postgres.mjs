/**
 * Zero-install PostgreSQL for local development and CI: a real PostgreSQL 17
 * (WASM) exposed over the wire protocol, so `pg`/Prisma connect with a plain
 * DATABASE_URL. Applies Prisma migrations + search indexes, optionally seeds.
 *
 * Usage:  node scripts/dev-postgres.mjs [--port 5433] [--seed]
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1] || 5433);
const shouldSeed = args.includes("--seed");
const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".pglite-data");

const db = new PGlite(dataDir, { extensions: { pg_trgm } });

async function applyMigrations() {
  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  const entries = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  await db.exec(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (id TEXT PRIMARY KEY, migration_name TEXT NOT NULL, finished_at TIMESTAMPTZ)`);
  for (const name of entries) {
    const applied = await db.query(`SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1`, [name]);
    if (applied.rows.length > 0) continue;
    const sql = readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
    console.log(`applying migration ${name}`);
    await db.exec(sql);
    await db.query(`INSERT INTO "_prisma_migrations" (id, migration_name, finished_at) VALUES ($1, $2, NOW())`, [crypto.randomUUID(), name]);
  }
  const indexes = readFileSync(path.join(process.cwd(), "prisma", "search-indexes.sql"), "utf8");
  await db.exec(indexes);
  console.log("search indexes ensured");
}

await applyMigrations();
if (shouldSeed) {
  console.log("seeding demo data…");
  const { execa } = await import("execa").catch(() => ({ execa: null }));
  if (execa) await execa("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit" });
  else console.log("(run `npm run db:seed` in another terminal to seed)");
}

const server = new PGLiteSocketServer({ db, port, host: "0.0.0.0" });
await server.start();
console.log(`PGlite PostgreSQL listening on 0.0.0.0:${port} — DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:${port}/postgres`);
