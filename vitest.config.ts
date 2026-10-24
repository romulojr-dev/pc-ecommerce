import { defineConfig } from "vitest/config"

// Unit tests only: pure functions in Node, no database or env vars.
// E2E tests are Playwright's (e2e/*.spec.ts).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "generated/**", "e2e/**"],
  },
})
