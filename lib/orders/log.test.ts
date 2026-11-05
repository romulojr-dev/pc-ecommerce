import { afterEach, describe, expect, it, vi } from "vitest"

import { logCronEvent, logReleaseEvent, safeErrorText } from "./log"

describe("safeErrorText", () => {
  it("names the error and its code, never its message", () => {
    const error = Object.assign(
      new Error("Key (idempotencyKey)=(SECRETSECRETSECRET) already exists."),
      { name: "PrismaClientKnownRequestError", code: "P2002" }
    )
    expect(safeErrorText(error)).toBe("PrismaClientKnownRequestError (P2002)")
  })

  it("names an error with no code", () => {
    expect(safeErrorText(new TypeError("secret detail"))).toBe("TypeError")
  })

  it("ignores a code that isn't text", () => {
    expect(safeErrorText(Object.assign(new Error("x"), { code: 23505 }))).toBe(
      "Error"
    )
  })

  it("never reads what isn't an error", () => {
    expect(safeErrorText("a secret string")).toBe("unknown error")
    expect(safeErrorText({ message: "a secret" })).toBe("unknown error")
    expect(safeErrorText(null)).toBe("unknown error")
  })
})

// docs/specs/033-release-unpaid-orders, rule Logging
describe("release log lines", () => {
  afterEach(() => vi.restoreAllMocks())

  const lines = () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    return () => info.mock.calls.map(([line]) => JSON.parse(String(line)))
  }

  it("writes one JSON line per released or skipped order", () => {
    const read = lines()
    logReleaseEvent({
      outcome: "released",
      orderNumber: "PCS-7KQ2M9XD",
      via: "sweep",
    })
    logReleaseEvent({
      outcome: "skipped",
      orderNumber: "PCS-3M8V1QZA",
      via: "purchase",
      code: "timeout",
    })
    expect(read()).toEqual([
      {
        event: "order.release",
        outcome: "released",
        orderNumber: "PCS-7KQ2M9XD",
        via: "sweep",
      },
      {
        event: "order.release",
        outcome: "skipped",
        orderNumber: "PCS-3M8V1QZA",
        via: "purchase",
        code: "timeout",
      },
    ])
  })

  it("writes the cron's summary and its refusal", () => {
    const read = lines()
    logCronEvent({ released: 2, skipped: 1, emails: 0 })
    logCronEvent({ outcome: "unauthorized" })
    expect(read()).toEqual([
      { event: "order.release.cron", released: 2, skipped: 1, emails: 0 },
      { event: "order.release.cron", outcome: "unauthorized" },
    ])
  })
})
