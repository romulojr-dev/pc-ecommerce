import { normalizeHost, parseDatabaseUrl } from "@/lib/db-url"

// The catalog reset's production guard (docs/specs/022-share-build, Rules ›
// Production safety; ADR 0007). A reset empties the catalog and, with it,
// shared builds. It runs from `pnpm db:seed --reset` and from the integration
// tests' resetCatalog(). Pure: it takes the environment as an argument, so it
// is unit-tested without a database. It never prints a password.

export class ResetRefusedError extends Error {}

type Env = Record<string, string | undefined>

const WHAT_IT_DELETES =
  "A reset deletes shared builds and, later, carts and orders."

const refuse = (reason: string) =>
  new ResetRefusedError(
    `Refusing to reset the catalog: ${reason} ${WHAT_IT_DELETES}`
  )

// Throws ResetRefusedError when a reset must not run:
// - NODE_ENV or VERCEL_ENV is "production";
// - the host of DATABASE_URL is PRODUCTION_DATABASE_HOST (a pooled and a
//   direct URL of one Neon branch count as one host);
// - with `requireProductionHost`, PRODUCTION_DATABASE_HOST is not set, since
//   then nothing says which database is production. The seed script asks for
//   this, because a hand-run reset with production URLs in the shell passes
//   the two environment checks (VERCEL_ENV is never set outside Vercel).
export function assertResetAllowed(
  env: Env,
  { requireProductionHost = false }: { requireProductionHost?: boolean } = {}
): void {
  for (const name of ["NODE_ENV", "VERCEL_ENV"] as const) {
    if (env[name] === "production") throw refuse(`${name} is production.`)
  }

  const productionHost = env.PRODUCTION_DATABASE_HOST
  if (!productionHost) {
    if (requireProductionHost) {
      throw new ResetRefusedError(
        "Refusing to reset the catalog: PRODUCTION_DATABASE_HOST is not set, so I can't tell whether this is production. Set it in .env.local."
      )
    }
    return
  }

  const target = env.DATABASE_URL ? parseDatabaseUrl(env.DATABASE_URL) : null
  if (!target) {
    throw refuse(
      "DATABASE_URL is not a postgres URL, so I can't tell which database this is."
    )
  }
  if (target.host === normalizeHost(productionHost)) {
    throw refuse(
      `${target.host} is the production database (PRODUCTION_DATABASE_HOST).`
    )
  }
}
