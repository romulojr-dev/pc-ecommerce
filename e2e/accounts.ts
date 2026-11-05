import type { BrowserContext, Page } from "@playwright/test"

// The accounts the admin sign-in E2E uses (docs/specs/039-staff-sign-in-admin-
// shell, §3 E2E). Not a spec itself: Playwright only runs *.spec.ts files.
//
// Owner and staff are created before the run with `pnpm staff:create`, the
// demo user by `pnpm db:seed --accounts-only`; docs/setup/admin-accounts.md
// has the commands, and CI runs them. The passwords come from the environment
// (D13), never from this repo: a password committed here would be valid on
// every database these accounts are created in. Test tooling, not app code, so
// it reads process.env directly.

export type Role = "owner" | "staff" | "demo"

export const ROLES: Role[] = ["owner", "staff", "demo"]

export const ACCOUNTS: Record<
  Role,
  { email: string; name: string; label: string }
> = {
  owner: {
    email: "e2e-owner@example.test",
    name: "E2E Owner",
    label: "Owner",
  },
  staff: {
    email: "e2e-staff@example.test",
    name: "E2E Staff",
    label: "Staff",
  },
  demo: {
    email: "demo@pcsilicon.tech",
    name: "Demo reviewer",
    label: "Demo (read-only)",
  },
}

export function passwordFor(role: Role): string {
  const variable =
    role === "demo" ? "DEMO_ACCOUNT_PASSWORD" : "E2E_ACCOUNT_PASSWORD"
  const value = process.env[variable]
  if (!value) {
    throw new Error(
      `${variable} is not set, so the ${role} account can't sign in. Set it in .env.local (see docs/setup/admin-accounts.md).`
    )
  }
  return value
}

// Where the setup project saves each role's signed-in browser state
export const authFile = (role: Role) => `e2e/.auth/${role}.json`

// A client IP of this test's own. Sign-in allows 3 requests per 10 seconds per
// IP, so tests that sign in (or fail to) each send a different one in
// X-Forwarded-For instead of sharing the machine's address.
export function newIp(): string {
  const octet = () => Math.floor(Math.random() * 254) + 1
  return `10.${octet()}.${octet()}.${octet()}`
}

export async function setClientIp(target: Page | BrowserContext, ip = newIp()) {
  await target.setExtraHTTPHeaders({ "x-forwarded-for": ip })
  return ip
}

export const MISSING_ACCOUNT = (role: Role) =>
  `The ${role} account doesn't exist in this database. Create the E2E accounts: see docs/setup/admin-accounts.md.`
