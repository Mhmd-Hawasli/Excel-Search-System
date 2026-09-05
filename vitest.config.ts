import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("src/", import.meta.url)) },
  },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "src/generated", ".next", ".next-dev"],
    // ExcelJS registers process-wide temporary-file cleanup for streaming
    // worksheets, so test files must not race that cleanup in parallel workers.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      // Coverage scope: the first-party logic layer (`lib`, `utils`,
      // `hooks`, `types`) where unit tests are the right tool. Route
      // pages/handlers are thin HTTP/RSC adapters around covered services,
      // and the presentational components/features are verified by the
      // build, existing component tests and live smoke checks.
      include: ["src/lib/**", "src/utils/**", "src/hooks/**", "src/types/**"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/types.ts",
        "src/types/**",
        "src/lib/actions/result.ts",
        "src/features/**/client.ts",
        // Integration-covered orchestration: these modules wrap Prisma/raw
        // SQL I/O and are exercised end-to-end by `scripts/verify-*.ts`
        // against PostgreSQL plus the live smoke checks; unit-mocking their
        // I/O would only test the mocks.
        "src/lib/excel/import-worker.ts",
        "src/lib/excel/replacement-worker.ts",
        "src/lib/excel/update-mapping-service.ts",
        "src/lib/actions/categories.ts",
        "src/lib/actions/files.ts",
        "src/lib/activity.ts",
        "src/lib/backup/service.ts",
        "src/lib/conflicts/query.ts",
        "src/lib/edits/service.ts",
        "src/lib/search/query.ts",
        "src/lib/merge/session.ts",
        "src/lib/merge/storage.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
