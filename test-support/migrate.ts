import { execSync } from "node:child_process"

import { resolveTestDatabase } from "./db-guard"

// Applies the migrations to the integration test database, after the guard has
// checked that it is not the app's. Used by the Vitest global setup and by
// `pnpm test:db:migrate`.
export function migrateTestDatabase(env: NodeJS.ProcessEnv) {
  const { url, label } = resolveTestDatabase(env)
  console.log(`Test database: ${label}`)

  // Prisma's config reads the direct URL from DATABASE_URL_UNPOOLED
  execSync("pnpm exec prisma migrate deploy", {
    env: { ...env, DATABASE_URL_UNPOOLED: url },
    stdio: "inherit",
  })
}
