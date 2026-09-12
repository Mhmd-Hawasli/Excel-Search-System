import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import * as queries from "@/lib/conflicts/query";
import type { ConflictRequest } from "@/lib/conflicts/request";
import { Prisma } from "@/generated/prisma/client";

// Read-only: compare the separate queries and the dashboard using one DB snapshot.
async function main() {
  if (process.argv.includes("--cache")) {
    // Writes only derived cache entries; never modifies source data.
    const input: ConflictRequest = {
      category: "invalid",
      field: "all",
      rule: "all",
      page: 1,
      pageSize: 25,
      sortBy: "issueNumber",
      sortDir: "asc",
    };
    const scope = { groupIds: null, fileIds: null };
    const start = performance.now();
    const first = await queries.queryConflictDashboard(input, scope);
    const middle = performance.now();
    const repeat = await queries.queryConflictDashboard(input, scope);
    const end = performance.now();
    assert.deepEqual(first, repeat);
    console.log(
      JSON.stringify({
        firstRequestMs: Math.round(middle - start),
        cachedRequestMs: Math.round(end - middle),
        identical: true,
        recordsScanned: repeat.stats.recordsScanned,
      }),
    );
    return;
  }
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const scope = { groupIds: null, fileIds: null };
      const input: ConflictRequest = {
        category: "invalid",
        field: "all",
        rule: "all",
        page: 1,
        pageSize: 25,
        sortBy: "issueNumber",
        sortDir: "asc",
      };
      if (process.argv.includes("--explain")) {
        const query = queries.buildConflictDashboardQuery(input, scope);
        const plans = await tx.$queryRaw<Array<Record<string, Array<Record<string, unknown>>>>>(
          Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
        );
        const explain = plans[0]["QUERY PLAN"][0];
        const nodes: Array<{
          node: unknown;
          relation: unknown;
          cte: unknown;
          ms: number;
          rows: unknown;
          loops: unknown;
        }> = [];
        function walk(node: Record<string, unknown>) {
          nodes.push({
            node: node["Node Type"],
            relation: node["Relation Name"],
            cte: node["Subplan Name"] ?? node["CTE Name"],
            ms: Number(node["Actual Total Time"]),
            rows: node["Actual Rows"],
            loops: node["Actual Loops"],
          });
          for (const child of (node.Plans ?? []) as Record<string, unknown>[]) walk(child);
        }
        walk(explain.Plan as Record<string, unknown>);
        console.log(
          JSON.stringify(
            {
              executionMs: explain["Execution Time"],
              nodes: nodes.sort((a, b) => b.ms - a.ms).slice(0, 20),
            },
            null,
            2,
          ),
        );
        return;
      }
      const start = performance.now();
      const stats = await queries.queryConflictStats(scope, tx);
      const middle = performance.now();
      const results = await queries.queryConflicts(input, tx);
      const end = performance.now();
      console.log(
        JSON.stringify({
          statsMs: Math.round(middle - start),
          resultsMs: Math.round(end - middle),
          separateMs: Math.round(end - start),
          recordsScanned: stats.recordsScanned,
          instances: stats.instances,
          matched: results.total,
        }),
      );
      const dashboard = Reflect.get(queries, "queryConflictDashboard");
      if (typeof dashboard === "function") {
        const combinedStart = performance.now();
        const combined = await dashboard(input, scope, tx);
        // Stats ties can be returned in arbitrary order; compare canonicalized lists.
        const normalized = (value: queries.ConflictStats) => ({
          ...value,
          rules: [...value.rules].sort((a, b) => a.rule.localeCompare(b.rule)),
          files: [...value.files].sort((a, b) => a.fileId.localeCompare(b.fileId)),
        });
        assert.deepEqual(combined.results, results);
        assert.deepEqual(normalized(combined.stats), normalized(stats));
        console.log(
          JSON.stringify({
            combinedMs: Math.round(performance.now() - combinedStart),
            identical: true,
          }),
        );
      }
    },
    { isolationLevel: "RepeatableRead", timeout: 180_000 },
  );
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
