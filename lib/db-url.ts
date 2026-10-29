// Reading the host out of a database URL, for the guards that must tell two
// databases apart: the integration tests' (test-support/db-guard.ts) and the
// catalog reset's (lib/reset-guard.ts). Pure, and it never returns the
// password.

export type ParsedDatabaseUrl = {
  host: string
  port: string
  database: string
}

// Neon's pooled host is the direct host plus "-pooler" on its first label
const POOLER = /-pooler(?=\.)/

// A host as the guards compare it: lowercase, and a pooled and a direct URL
// of one Neon branch count as one host
export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(POOLER, "")
}

export function parseDatabaseUrl(value: string): ParsedDatabaseUrl | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return null
  }
  return {
    host: normalizeHost(url.hostname),
    port: url.port || "5432",
    database: decodeURIComponent(url.pathname.slice(1)),
  }
}

// "host:port/database", safe to print
export function describeDatabase({
  host,
  port,
  database,
}: ParsedDatabaseUrl): string {
  return `${host}:${port}/${database}`
}
