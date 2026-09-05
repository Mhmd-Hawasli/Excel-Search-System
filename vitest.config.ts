import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "generated", ".next", ".next-dev"],
    // ExcelJS registers process-wide temporary-file cleanup for streaming
    // worksheets, so test files must not race that cleanup in parallel workers.
    fileParallelism: false,
  },
});
