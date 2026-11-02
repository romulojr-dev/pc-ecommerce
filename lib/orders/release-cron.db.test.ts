import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { fakeGateway } from "@/lib/payments/fake"
import type { PaymentGateway } from "@/lib/payments/gateway-types"
import { insertParts } from "@/test-support/build-fixtures"
import { db, resetCatalog } from "@/test-support/db"
import {
  EXPIRES,
  heldOrder,
  openSession,
  PLACED,
  releaseTokenHash,
} from "@/test-support/release"
import { seed } from "@/test-support/seed-parts"

import { runReleaseCron } from "./release-cron"

// docs/specs/033-release-unpaid-orders: T1–T6, the cron's work with the
// secret passed in

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag: vi.fn(),
}))

let info: { mock: { calls: unknown[][] } }
beforeEach(async () => {
  await resetCatalog()
  info = vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const SECRET = "c".repeat(32)
const NOW = EXPIRES
const lagging = () => fakeGateway({ now: () => PLACED })
const run = (authorization: string | null, gateway = lagging()) =>
  runReleaseCron(authorization, {
    secret: SECRET,
    now: NOW,
    gateway,
    environment: "development",
  })

async function ryzen(stock = 40) {
  const ids = await insertParts([seed.ryzen5_7600], {
    [seed.ryzen5_7600.id]: { stock },
  })
  return ids.get(seed.ryzen5_7600.id)!
}

describe("the secret", () => {
  it.each([
    ["no header (T1)", null],
    ["a wrong token (T2)", "Bearer wrong"],
    ["the secret plus one character (T2)", `Bearer ${SECRET}x`],
    ["another scheme (T2)", `Basic ${SECRET}`],
  ])("refuses %s, reading nothing", async (_, header) => {
    const query = vi.spyOn(db, "$queryRaw")
    expect(await run(header)).toEqual({ status: 401 })
    expect(query).not.toHaveBeenCalled()
    expect(info.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([
      { event: "order.release.cron", outcome: "unauthorized" },
    ])
  })

  it("refuses every call when no secret is set (T3)", async () => {
    expect(
      await runReleaseCron(`Bearer ${SECRET}`, { secret: undefined })
    ).toEqual({ status: 401 })
  })
})

describe("the run", () => {
  it("releases every due order (T4) and answers 0 when none is (T5)", async () => {
    const product = await ryzen()
    await heldOrder([{ productId: product, quantity: 2 }])
    await heldOrder([{ productId: product, quantity: 1 }], {
      expiresAt: new Date("2026-11-02T06:00:00Z"),
    })

    expect(await run(`Bearer ${SECRET}`)).toEqual({
      status: 200,
      body: { released: 2, skipped: 0 },
    })
    expect(await run(`Bearer ${SECRET}`)).toEqual({
      status: 200,
      body: { released: 0, skipped: 0 },
    })
  })

  it("works in batches and tries a failing order once (T6)", async () => {
    const product = await ryzen()
    const failing = await heldOrder([{ productId: product, quantity: 1 }], {
      accessTokenHash: releaseTokenHash(),
      expiresAt: new Date("2026-11-01T08:00:00Z"),
    })
    const session = await openSession(failing.id)
    for (let i = 0; i < 29; i++) {
      await heldOrder([{ productId: product, quantity: 1 }])
    }
    // The gateway fails for that one session only
    const base = lagging()
    const close = vi.fn((id: string) =>
      id === session
        ? Promise.resolve({ ok: false as const, code: "http-500" })
        : base.closeSession(id)
    )
    const gateway: PaymentGateway = { ...base, closeSession: close }

    expect(await run(`Bearer ${SECRET}`, gateway)).toEqual({
      status: 200,
      body: { released: 29, skipped: 1 },
    })
    expect(close.mock.calls.filter(([id]) => id === session)).toHaveLength(1)
    const summary = info.mock.calls
      .map(([line]) => JSON.parse(String(line)))
      .filter((line) => line.event === "order.release.cron")
    expect(summary).toEqual([
      { event: "order.release.cron", released: 29, skipped: 1 },
    ])
  })

  it("stops at the budget", async () => {
    const product = await ryzen()
    await heldOrder([{ productId: product, quantity: 1 }])
    let time = 0
    expect(
      await runReleaseCron(`Bearer ${SECRET}`, {
        secret: SECRET,
        now: NOW,
        gateway: lagging(),
        environment: "development",
        clock: () => (time += 60_000),
        budgetMs: 50_000,
      })
    ).toEqual({ status: 200, body: { released: 0, skipped: 0 } })
  })
})
