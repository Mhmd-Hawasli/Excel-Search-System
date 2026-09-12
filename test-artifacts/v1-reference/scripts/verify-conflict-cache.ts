import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { Prisma } from "@/generated/prisma/client";
import { conflictQueryCacheKey, queryWithConflictCache } from "@/lib/conflicts/cache";

// Exercise the real migration and cache SQL in an isolated, rolled-back schema.
// No production source rows or cache entries are changed by this verification.
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const schema = `conflict_cache_test_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    const tables = ["records", "files", "file_columns", "upload_jobs", "ignored_conflicts"];
    for (const table of tables) {
      await client.query(`CREATE TABLE "${table}" (id INTEGER PRIMARY KEY, value TEXT)`);
    }
    const migration = await readFile(
      "prisma/migrations/20260906140000_conflict_query_cache/migration.sql",
      "utf8",
    );
    await client.query(migration.replaceAll("public.", `"${schema}".`));
    await client.query("INSERT INTO records VALUES (1, 'original')");

    const query = Prisma.sql`SELECT id, value FROM records ORDER BY id`;
    let calculations = 0;
    let afterCalculation: (() => Promise<void>) | undefined;
    let failCalculation = false;
    const execute = async (input: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => {
      const sql = "sql" in input ? input : Prisma.sql(input, ...values);
      if (sql.text === query.text) {
        calculations++;
        if (failCalculation) throw new Error("intentional calculation failure");
      }
      const result = await client.query(sql.text, [...sql.values]);
      if (sql.text === query.text && afterCalculation) {
        const hook = afterCalculation;
        afterCalculation = undefined;
        await hook();
      }
      return result;
    };
    type TestAdapter = {
      $queryRaw: (
        input: Prisma.Sql | TemplateStringsArray,
        ...values: unknown[]
      ) => Promise<unknown[]>;
      $executeRaw: (
        input: Prisma.Sql | TemplateStringsArray,
        ...values: unknown[]
      ) => Promise<number>;
      $transaction: <T>(callback: (tx: TestAdapter) => Promise<T>) => Promise<T>;
    };
    const adapter: TestAdapter = {
      $queryRaw: async (input: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) =>
        (await execute(input, ...values)).rows,
      $executeRaw: async (input: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) =>
        (await execute(input, ...values)).rowCount ?? 0,
      $transaction: async <T>(callback: (tx: TestAdapter) => Promise<T>): Promise<T> => {
        await client.query("SAVEPOINT cache_build");
        try {
          const result = await callback(adapter);
          await client.query("RELEASE SAVEPOINT cache_build");
          return result;
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT cache_build");
          await client.query("RELEASE SAVEPOINT cache_build");
          throw error;
        }
      },
    };
    const database = adapter as unknown as NonNullable<
      Parameters<typeof queryWithConflictCache>[1]
    >;
    const read = () => queryWithConflictCache<{ id: number; value: string }>(query, database);
    const revision = async () =>
      (await client.query("SELECT revision::text FROM conflict_cache_state")).rows[0].revision;
    const original = await read();
    assert.deepEqual(original, [{ id: 1, value: "original" }]);
    assert.deepEqual(await read(), original);
    assert.equal(calculations, 1, "repeat request must read the persisted result");
    assert.equal(
      (await client.query("SELECT count(*)::int AS n FROM conflict_query_cache")).rows[0].n,
      1,
    );

    for (const table of tables) {
      for (const statement of [
        `INSERT INTO "${table}" VALUES (2, 'added')`,
        `UPDATE "${table}" SET value = 'edited' WHERE id = 2`,
        `DELETE FROM "${table}" WHERE id = 2`,
        `TRUNCATE "${table}"`,
      ]) {
        const beforeRevision = await revision();
        const beforeCalculations: number = calculations;
        await client.query(statement);
        assert.notEqual(await revision(), beforeRevision, statement);
        assert.deepEqual(await read(), (await client.query(query.text)).rows);
        assert.equal(calculations, beforeCalculations + 1, `must rebuild after ${statement}`);
        await read();
        assert.equal(calculations, beforeCalculations + 1, "rebuilt result must be reusable");
      }
    }

    await client.query("INSERT INTO records VALUES (1, 'restored')");
    await read();
    const beforeRollback = calculations;
    const revisionBeforeRollback = await revision();
    await client.query("SAVEPOINT source_edit");
    await client.query("UPDATE records SET value = 'rolled back'");
    await client.query("ROLLBACK TO SAVEPOINT source_edit");
    assert.equal(await revision(), revisionBeforeRollback);
    assert.deepEqual(await read(), [{ id: 1, value: "restored" }]);
    assert.equal(calculations, beforeRollback, "rolled-back writes must not invalidate");

    await client.query("UPDATE conflict_query_cache SET checked_date = CURRENT_DATE - 1");
    await read();
    assert.equal(calculations, beforeRollback + 1, "date-sensitive rules must refresh next day");

    // Simulate a source revision changing between calculation and persistence.
    await client.query("UPDATE records SET value = 'before race'");
    afterCalculation = async () => {
      await client.query("UPDATE records SET value = 'after race'");
    };
    assert.deepEqual(await read(), [{ id: 1, value: "before race" }]);
    assert.equal(
      (
        await client.query(`
      SELECT count(*)::int AS n FROM conflict_query_cache c
      JOIN conflict_cache_state s ON c.source_revision = s.revision
    `)
      ).rows[0].n,
      0,
      "old snapshot must never be stored under the new revision",
    );
    assert.deepEqual(await read(), [{ id: 1, value: "after race" }]);

    await client.query("UPDATE records SET value = 'after failure'");
    failCalculation = true;
    await assert.rejects(read, /intentional calculation failure/);
    failCalculation = false;
    assert.deepEqual(await read(), [{ id: 1, value: "after failure" }]);

    const allowed = Prisma.sql`SELECT id, value FROM records WHERE id = ${1}`;
    const denied = Prisma.sql`SELECT id, value FROM records WHERE id = ${2}`;
    assert.notEqual(conflictQueryCacheKey(allowed), conflictQueryCacheKey(denied));
    assert.deepEqual(await queryWithConflictCache(allowed, database), [
      { id: 1, value: "after failure" },
    ]);
    assert.deepEqual(await queryWithConflictCache(denied, database), []);
    console.log(
      "PASS: persistent hits, 20 source mutations, rollback, midnight, revision race, failure, scope isolation.",
    );
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
