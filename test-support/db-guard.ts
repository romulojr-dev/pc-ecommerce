// Safety guard for the database integration tests (docs/specs/012-common-
// filters). Those tests empty the catalog tables, so they must never run
// against the database the app uses. Pure: takes the environment as an
// argument, so it is unit-tested without a database.

import { describeDatabase, parseDatabaseUrl } from "../lib/db-url"

export type TestDatabase = {
  // The URL to connect with. Never print it: it holds the password.
  url: string
  // "host:port/database", safe to print
  label: string
}

export class TestDatabaseError extends Error {}

type Env = Record<string, string | undefined>

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

// The URL the integration tests may use, or an error saying why not.
// Refused: a missing or malformed TEST_DATABASE_URL, and one on the same host
// as DATABASE_URL or DATABASE_URL_UNPOOLED. A loopback host (CI's throwaway
// Postgres, a local Docker one) is a scratch server by definition, so there
// the same host is fine as long as the database name differs.
export function resolveTestDatabase(env: Env): TestDatabase {
  const url = env.TEST_DATABASE_URL
  if (!url) {
    throw new TestDatabaseError(
      "TEST_DATABASE_URL is not set. The integration tests empty the catalog tables, so they need a database of their own (`pnpm test:db:up` starts one in Docker); they never use DATABASE_URL. See the README."
    )
  }
  const target = parseDatabaseUrl(url)
  if (!target) {
    throw new TestDatabaseError(
      "TEST_DATABASE_URL must be a postgres:// or postgresql:// URL."
    )
  }

  const loopback = LOOPBACK_HOSTS.has(target.host)
  for (const name of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const) {
    const value = env[name]
    const app = value ? parseDatabaseUrl(value) : null
    if (!app || app.host !== target.host || app.port !== target.port) continue

    if (!loopback) {
      throw new TestDatabaseError(
        `TEST_DATABASE_URL points at ${describeDatabase(target)}, the same host as ${name}. Use a separate server for the tests (pnpm test:db:up).`
      )
    }
    if (app.database === target.database) {
      throw new TestDatabaseError(
        `TEST_DATABASE_URL points at ${describeDatabase(target)}, the same database as ${name}. Use a different database name.`
      )
    }
  }

  return { url, label: describeDatabase(target) }
}
