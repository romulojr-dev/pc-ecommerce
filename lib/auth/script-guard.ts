import { normalizeHost, parseDatabaseUrl } from "@/lib/db-url"

// Which database a staff script is about to write to, and whether it may
// (docs/specs/039-staff-sign-in-admin-shell, Rule 27, D12, D14). Pure: it
// takes the URL, the production host and the flag, and never returns a
// password.
//
// - the production database needs --production;
// - --production on any other database is refused, so the flag can't become
//   a habit;
// - with PRODUCTION_DATABASE_HOST unset only a local database (Docker, CI) is
//   accepted, since nothing says which remote one is production.
// Hosts are compared after normalizeHost (lower-case, Neon's "-pooler"
// removed), so the pooled and the direct URL of one branch are one host.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

export type ScriptTarget =
  | { ok: true; host: string }
  | { ok: false; host: string | null; message: string }

export function decideScriptTarget({
  databaseUrl,
  productionHost,
  production,
}: {
  databaseUrl: string | undefined
  productionHost: string | undefined
  production: boolean
}): ScriptTarget {
  const target = databaseUrl ? parseDatabaseUrl(databaseUrl) : null
  if (!target) {
    return {
      ok: false,
      host: null,
      message:
        "Refusing: DATABASE_URL is not a postgres URL, so I can't tell which database this is.",
    }
  }
  const host = target.host

  if (productionHost) {
    const isProduction = host === normalizeHost(productionHost)
    if (isProduction && !production) {
      return {
        ok: false,
        host,
        message: `Refusing: ${host} is the production database. Pass --production to confirm.`,
      }
    }
    if (!isProduction && production) {
      return {
        ok: false,
        host,
        message: `Refusing: --production was passed but ${host} is not the production database.`,
      }
    }
    return { ok: true, host }
  }

  // PRODUCTION_DATABASE_HOST unset: only a local database can be told apart
  if (!production && LOCAL_HOSTS.has(host)) return { ok: true, host }
  return {
    ok: false,
    host,
    message: `Refusing: PRODUCTION_DATABASE_HOST is not set, so I can't tell whether ${host} is production. Set it in .env.local.`,
  }
}
