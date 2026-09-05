import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "generated", ".next", ".next-dev"],
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
      include: ["lib/**", "utils/**", "hooks/**", "types/**"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/types.ts",
        "types/**",
        "lib/actions/result.ts",
        "features/**/client.ts",
        // Integration-covered orchestration: these modules wrap Prisma/raw
        // SQL I/O and are exercised end-to-end by `scripts/verify-*.ts`
        // against PostgreSQL plus the live smoke checks; unit-mocking their
        // I/O would only test the mocks.
        "lib/excel/import-worker.ts",
        "lib/excel/replacement-worker.ts",
        "lib/excel/update-mapping-service.ts",
        "lib/actions/categories.ts",
        "lib/actions/files.ts",
        "lib/activity.ts",
        "lib/backup/service.ts",
        "lib/conflicts/query.ts",
        "lib/edits/service.ts",
        "lib/search/query.ts",
        "lib/merge/session.ts",
        "lib/merge/storage.ts",
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
