import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

const ignores = globalIgnores([
  "node_modules/**",
  ".next/**",
  ".next-dev/**",
  "next-env.d.ts",
]);

/**
 * ESLint flat config. `next lint` was removed in Next.js 16, so ESLint runs
 * directly via the `eslint` CLI (scripts: `lint`).
 */
export default defineConfig([
  ignores,
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-console": ["error", { allow: ["error"] }],
    },
  },
]);
