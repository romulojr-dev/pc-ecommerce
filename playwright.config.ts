import { defineConfig, devices } from "@playwright/test"

const baseURL = "http://localhost:3000"
// Test tooling, not app code, so it reads process.env directly
const isCI = !!process.env.CI

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
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
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
