import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Admin mutations are built only with adminAction / adminRoute, and only
  // in the admin folders (docs/specs/040-admin-permissions-audit-masking,
  // R9): the guard may be imported only by an admin actions.ts or route.ts,
  // and a "use server" directive inside the admin folders only lives in an
  // actions.ts, so the enumeration test finds every entry point.
  {
    files: ["**/*.{ts,tsx,mjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/admin/guard"],
              message:
                "Build admin mutations with adminAction / adminRoute only in an admin actions.ts or route.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "app/admin/**/actions.ts",
      "app/api/admin/**/route.ts",
      "lib/admin/**",
      "test-support/**",
      "**/*.test.{ts,tsx}",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: [
      "app/admin/**",
      "app/api/admin/**",
      "components/admin/**",
      "lib/admin/**",
    ],
    ignores: ["**/actions.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExpressionStatement[directive='use server']",
          message:
            "Admin server actions live in an actions.ts file (docs/specs/040-admin-permissions-audit-masking, R9).",
        },
      ],
    },
  },
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
    files: [
      "lib/builder/**",
      "lib/specs/**",
      "lib/vouchers/**",
      "lib/admin/permissions.ts",
      "lib/admin/mask.ts",
      "lib/admin/marker.ts",
      "lib/admin/orders-params.ts",
      "lib/admin/orders-view.ts",
    ],
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
                "lib/builder, lib/specs, lib/vouchers and the admin permission, mask and marker files run in the browser and on the server: import only zod, lib/specs and plain TypeScript.",
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
])

export default eslintConfig
