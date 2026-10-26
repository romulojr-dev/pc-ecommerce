import { config } from "dotenv"
import { defineConfig } from "vitest/config"

import { resolveTestDatabase } from "./test-support/db-guard"

// Database integration tests (*.db.test.ts), run by `pnpm test:db`; the unit
// tests (vitest.config.ts) stay pure. Load .env.local like prisma7.config.ts;
// in CI the variables already exist.
config({ path: ".env.local", quiet: true })

// Throws, so Vitest doesn't start, when the test database is missing or is
// the app's own (test-support/db-guard.ts)
const { url } = resolveTestDatabase(process.env)

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["**/*.db.test.ts"],
    exclude: ["node_modules/**", ".next/**", "generated/**", "e2e/**"],
    globalSetup: ["./test-support/db-global-setup.ts"],
    // The files share one database, so they run one after another
    fileParallelism: false,
    // The code under test reads the app's variables; point them at the test
    // database (the app's own URLs are never used here)
    env: {
      DATABASE_URL: url,
      DATABASE_URL_UNPOOLED: url,
      TEST_DATABASE_URL: url,
      NEXT_PUBLIC_SITE_URL:
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    },
  },
})
