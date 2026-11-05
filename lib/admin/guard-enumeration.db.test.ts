import { join } from "node:path"

import { beforeEach, describe, expect, test, vi } from "vitest"

import { db } from "@/lib/db"
import {
  fileHasUseServerDirective,
  scanModules,
  sourceFiles,
} from "@/test-support/admin-guard-scan"
import {
  makeStaffUser,
  resetSignInIps,
  signInCookie,
} from "@/test-support/admin-session"

// docs/specs/040-admin-permissions-audit-masking, R8: every marked function is
// called as Demo with empty input and no table changes (E5)

let currentHeaders = new Headers()
vi.mock("next/headers", () => ({ headers: async () => currentHeaders }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  },
}))

const root = process.cwd()

// Row counts of every table in the public schema
async function rowCounts(): Promise<Record<string, number>> {
  const tables = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
    ORDER BY table_name`
  const counts: Record<string, number> = {}
  for (const { table_name } of tables) {
    const [row] = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM "${table_name}"`
    )
    counts[table_name] = Number(row.n)
  }
  return counts
}

async function callAllAsDemo(paths: { path: string; kind: "actions" }[]) {
  const { guarded } = await scanModules(paths)
  expect(guarded.length).toBeGreaterThan(0)
  await makeStaffUser("demo@example.com", "DEMO")
  currentHeaders = new Headers({
    cookie: await signInCookie("demo@example.com"),
  })
  const before = await rowCounts()
  for (const { file, export: name } of guarded) {
    const fn = (await import(/* @vite-ignore */ file))[name] as (
      input?: unknown
    ) => Promise<{ ok: boolean; error?: string }>
    const result = await fn()
    // Refused, never "invalid" or "failed": the schema and handler never ran
    expect(result, `${file} ${name}`).toMatchObject({
      ok: false,
      error: "forbidden",
    })
  }
  expect(await rowCounts()).toEqual(before)
}

beforeEach(async () => {
  resetSignInIps()
  currentHeaders = new Headers()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User", "Voucher" CASCADE`
})

describe("calling every marked function as Demo", () => {
  test("the wrapped fixture is refused and writes nothing", async () => {
    await callAllAsDemo([
      {
        path: join(
          root,
          "test-support",
          "admin-fixtures",
          "wrapped-actions.ts"
        ),
        kind: "actions",
      },
    ])
  })

  test("every real admin action module is refused too", async () => {
    const real = sourceFiles(join(root, "app", "admin"))
      .filter((path) => fileHasUseServerDirective(path))
      .map((path) => ({ path, kind: "actions" as const }))
    // No admin mutation exists yet; the first Admin story that adds one makes
    // this loop real
    if (real.length === 0) return
    await callAllAsDemo(real)
  })
})
