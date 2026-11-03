import { beforeEach, describe, expect, it, vi } from "vitest"

// docs/specs/036-order-emails, V5: the page is a 404 unless the transport is
// fake and the environment is not Production, and it reads nothing first.

const listFakeEmails = vi.hoisted(() => vi.fn(async () => []))
const state = vi.hoisted(() => ({
  env: { EMAIL_TRANSPORT: "fake", VERCEL_ENV: undefined } as {
    EMAIL_TRANSPORT: string
    VERCEL_ENV: string | undefined
  },
}))

vi.mock("@/lib/env", () => ({
  get env() {
    return state.env
  },
}))
vi.mock("@/lib/email/dev-emails", () => ({ listFakeEmails }))
vi.mock("next/server", () => ({ connection: async () => {} }))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))

import DevEmailsPage from "./page"

beforeEach(() => {
  listFakeEmails.mockClear()
})

describe("/dev/emails", () => {
  it("V5: reads and renders with the fake transport", async () => {
    state.env = { EMAIL_TRANSPORT: "fake", VERCEL_ENV: "preview" }

    await DevEmailsPage()

    expect(listFakeEmails).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["resend", undefined],
    ["resend", "production"],
    ["fake", "production"],
  ])(
    "V5: is a 404 for transport %s in %s, with no read",
    async (transport, vercelEnv) => {
      state.env = { EMAIL_TRANSPORT: transport, VERCEL_ENV: vercelEnv }

      await expect(DevEmailsPage()).rejects.toThrow("NEXT_NOT_FOUND")

      expect(listFakeEmails).not.toHaveBeenCalled()
    }
  )
})
