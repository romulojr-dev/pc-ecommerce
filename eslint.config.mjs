import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Specs take `test` from e2e/test.ts, which fails on React key warnings
  {
    files: ["e2e/**/*.spec.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@playwright/test",
              importNames: ["test", "expect"],
              message: "Import test and expect from ./test instead.",
            },
          ],
        },
      ],
    },
  },
  // The rules engine and spec schemas run in the browser and on the server
  // (docs/specs/018-compatibility-rules), so they import no database,
  // server-only, Next.js or React code. Tests reach seed data through
  // test-support.
  {
    files: ["lib/builder/**", "lib/specs/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/db",
                "**/env",
                "**/generated/**",
                "**/prisma/**",
                "server-only",
                "next",
                "next/**",
                "react",
                "react/**",
                "react-dom",
                "react-dom/**",
              ],
              message:
                "lib/builder and lib/specs run in the browser and on the server: import only zod, lib/specs and plain TypeScript.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
