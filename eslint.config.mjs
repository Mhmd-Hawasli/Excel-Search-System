import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

const ignores = globalIgnores([
  "node_modules/**",
  ".next/**",
  ".next-dev/**",
  "generated/**",
  "coverage/**",
  "test-artifacts/**",
  "next-env.d.ts",
]);

/**
 * ESLint flat config. `next lint` was removed in Next.js 16, so ESLint runs
 * directly via the `eslint` CLI (scripts: `lint`, `lint:fix`).
 */
export default defineConfig([
  ignores,
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // The codebase deliberately uses PascalCase function components without
      // react-hooks/exhaustive-deps exceptions.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-console": ["error", { allow: ["error"] }],
    },
  },
  {
    // Scripts run with tsx/node and legitimately use the Node.js runtime.
    files: ["scripts/**/*.{ts,mjs}", "prisma/**/*.ts"],
    rules: { "no-console": "off" },
  },
]);
