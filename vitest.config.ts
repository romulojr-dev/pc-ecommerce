import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// Unit tests only: pure functions in Node, no database or env vars.
// Database integration tests (*.db.test.ts) are vitest.db.config.ts's
// (`pnpm test:db`); E2E tests are Playwright's (e2e/*.spec.ts).
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `import "server-only"` throws outside a server bundle; here it is empty
    alias: {
      "server-only": fileURLToPath(
        new URL("./test-support/server-only-stub.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "generated/**",
      "e2e/**",
      "**/*.db.test.ts",
    ],
  },
})
