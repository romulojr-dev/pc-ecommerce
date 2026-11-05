// The origins Better Auth trusts for its origin and CSRF checks
// (docs/specs/039-staff-sign-in-admin-shell, Rule 7). No host pattern and no
// wildcard: Production trusts NEXT_PUBLIC_SITE_URL only, a Preview its own two
// exact hosts, local runs localhost. Pure.

export const LOCAL_ORIGIN = "http://localhost:3000"

export type OriginEnv = {
  NEXT_PUBLIC_SITE_URL: string
  VERCEL_ENV?: string
  VERCEL_URL?: string
  VERCEL_BRANCH_URL?: string
}

// A Vercel system variable is a bare host. Anything that isn't one (a scheme,
// a path, a wildcard, spaces) is ignored rather than trusted.
const HOST =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

function originOfHost(host: string | undefined): string | null {
  if (!host) return null
  return HOST.test(host) ? `https://${host.toLowerCase()}` : null
}

export function trustedOriginsFor(env: OriginEnv): string[] {
  if (env.VERCEL_ENV === "production") {
    return [new URL(env.NEXT_PUBLIC_SITE_URL).origin]
  }
  if (env.VERCEL_ENV === "preview") {
    // VERCEL_URL is required on a Preview (lib/auth/env-schema.ts);
    // VERCEL_BRANCH_URL is trusted only when it is there
    return [originOfHost(env.VERCEL_URL), originOfHost(env.VERCEL_BRANCH_URL)]
      .filter((origin): origin is string => origin !== null)
      .filter((origin, index, all) => all.indexOf(origin) === index)
  }
  return [LOCAL_ORIGIN]
}
