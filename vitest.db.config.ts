import { fileURLToPath } from "node:url"

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
      // Always the fake gateway: the tests never reach Xendit, whatever
      // .env.local chooses (docs/specs/031-pay-with-xendit)
      PAYMENT_GATEWAY: "fake",
      XENDIT_WEBHOOK_TOKEN: "test-webhook-token",
      // Unset whatever .env.local says: the cron route then refuses every
      // call (docs/specs/033-release-unpaid-orders, T3); the cron's own tests
      // pass a secret in
      CRON_SECRET: "",
      // Always the fake email transport, and a fixed link secret
      // (docs/specs/035-email-foundation-signed-links)
      EMAIL_TRANSPORT: "fake",
      // Always the fake photo store, whatever .env.local chooses
      // (docs/specs/049-product-images-upload)
      IMAGE_STORAGE: "fake",
      BLOB_READ_WRITE_TOKEN: "",
      BLOB_PRODUCTION_HOST: "",
      ORDER_LINK_SECRET: "test-order-link-secret-0123456789abcdef-xyz",
      // A fixed session secret, different from the link secret
      // (docs/specs/039-staff-sign-in-admin-shell)
      BETTER_AUTH_SECRET: "test-better-auth-secret-0123456789-abcdefghij",
      DEMO_ACCOUNT_PASSWORD: "",
      VERCEL_URL: "",
      VERCEL_BRANCH_URL: "",
      VERCEL_ENV: "",
    },
  },
})
