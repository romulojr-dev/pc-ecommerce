import { describe, expect, test } from "vitest"

import { trustedOriginsFor } from "./origins"

// docs/specs/039-staff-sign-in-admin-shell, U3c

const SITE = "https://pcsilicon.tech"

describe("trustedOriginsFor", () => {
  test("production trusts NEXT_PUBLIC_SITE_URL only", () => {
    expect(
      trustedOriginsFor({
        NEXT_PUBLIC_SITE_URL: SITE,
        VERCEL_ENV: "production",
      })
    ).toEqual([SITE])
  })

  test("production ignores the Vercel hosts and a trailing path or slash", () => {
    expect(
      trustedOriginsFor({
        NEXT_PUBLIC_SITE_URL: `${SITE}/`,
        VERCEL_ENV: "production",
        VERCEL_URL: "pc-abc-team.vercel.app",
        VERCEL_BRANCH_URL: "pc-git-feat-team.vercel.app",
      })
    ).toEqual([SITE])
  })

  test("a preview trusts its two exact hosts", () => {
    expect(
      trustedOriginsFor({
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
        VERCEL_ENV: "preview",
        VERCEL_URL: "pc-abc-team.vercel.app",
        VERCEL_BRANCH_URL: "pc-git-feat-team.vercel.app",
      })
    ).toEqual([
      "https://pc-abc-team.vercel.app",
      "https://pc-git-feat-team.vercel.app",
    ])
  })

  test("a preview without VERCEL_BRANCH_URL trusts only VERCEL_URL", () => {
    expect(
      trustedOriginsFor({
        NEXT_PUBLIC_SITE_URL: SITE,
        VERCEL_ENV: "preview",
        VERCEL_URL: "pc-abc-team.vercel.app",
      })
    ).toEqual(["https://pc-abc-team.vercel.app"])
  })

  test("a preview never trusts the production site", () => {
    expect(
      trustedOriginsFor({
        NEXT_PUBLIC_SITE_URL: SITE,
        VERCEL_ENV: "preview",
        VERCEL_URL: "pc-abc-team.vercel.app",
      })
    ).not.toContain(SITE)
  })

  test("local runs (development, or no VERCEL_ENV) trust localhost", () => {
    expect(
      trustedOriginsFor({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })
    ).toEqual(["http://localhost:3000"])
    expect(
      trustedOriginsFor({
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
        VERCEL_ENV: "development",
        VERCEL_URL: "pc-abc-team.vercel.app",
      })
    ).toEqual(["http://localhost:3000"])
  })

  test("never a wildcard, and a malformed host is ignored, not trusted", () => {
    const origins = trustedOriginsFor({
      NEXT_PUBLIC_SITE_URL: SITE,
      VERCEL_ENV: "preview",
      VERCEL_URL: "*.vercel.app",
      VERCEL_BRANCH_URL: "https://evil.example/path",
    })
    expect(origins).toEqual([])
    for (const origin of origins) expect(origin).not.toContain("*")
  })

  test("the same host twice counts once", () => {
    expect(
      trustedOriginsFor({
        NEXT_PUBLIC_SITE_URL: SITE,
        VERCEL_ENV: "preview",
        VERCEL_URL: "same.vercel.app",
        VERCEL_BRANCH_URL: "SAME.vercel.app",
      })
    ).toEqual(["https://same.vercel.app"])
  })
})
