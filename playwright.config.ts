import { defineConfig, devices } from "@playwright/test"
import { config } from "dotenv"

const baseURL = "http://localhost:3000"

// The specs that change stock (e2e/stock.ts) reach the database the app uses,
// so they need its URL here too. Next reads .env.local itself for the server;
// CI has no file and sets the variables on the job. Variables already set
// (an inline DATABASE_URL) win.
config({ path: ".env.local", quiet: true })

// Test tooling, not app code, so it reads process.env directly
const isCI = !!process.env.CI

const desktop = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1280, height: 800 },
}

// E2E tests (e2e/*.spec.ts). Chromium only and desktop-first for the MVP.
export default defineConfig({
  testDir: "e2e",
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  // The admin sign-in specs need signed-in browser state, saved once per role
  // by the "setup" project (docs/specs/039-staff-sign-in-admin-shell). Only the
  // "admin" project depends on it, so a database without the E2E accounts
  // stops those specs and leaves the storefront ones running.
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: desktop,
    },
    {
      name: "admin",
      testMatch: /admin-.*\.spec\.ts/,
      dependencies: ["setup"],
      use: desktop,
    },
    {
      name: "chromium",
      testIgnore: [/auth\.setup\.ts/, /admin-.*\.spec\.ts/],
      use: desktop,
    },
  ],
  // CI serves the build from the earlier `pnpm build` step; locally the dev
  // server is started, or reused if one is already running
  webServer: {
    command: isCI ? "pnpm start" : "pnpm dev",
    url: baseURL,
    reuseExistingServer: !isCI,
  },
})
