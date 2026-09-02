import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    // ExcelJS registers process-wide temporary-file cleanup for streaming
    // worksheets, so test files must not race that cleanup in parallel workers.
    fileParallelism: false,
  },
});
