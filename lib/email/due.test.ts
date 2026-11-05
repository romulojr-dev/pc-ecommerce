import { describe, expect, it } from "vitest"

import {
  CAP_EXEMPT_TYPES,
  capDecision,
  dueDecision,
  isRetryableCode,
  LEASE_MS,
  MAX_ATTEMPTS,
  type OutboxRow,
  RETRY_AFTER_MS,
  SEND_WINDOW_MS,
  TRANSPORT_TIMEOUT_MS,
} from "./due"

// docs/specs/035-email-foundation-signed-links: R3, R4

const NOW = new Date("2026-11-01T12:00:00Z")
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const MIN = 60_000

const row = (overrides: Partial<OutboxRow> = {}): OutboxRow => ({
  status: "PENDING",
  attempts: 0,
  claimedAt: null,
  createdAt: ago(MIN),
  ...overrides,
})

describe("capDecision (R3)", () => {
  it("sends with 4 counted rows and skips with 5", () => {
    expect(capDecision(4)).toBe("send")
    expect(capDecision(5)).toBe("skip")
    expect(capDecision(6)).toBe("skip")
  })
})

describe("dueDecision (R4)", () => {
  it("a pending row is due", () => {
    expect(dueDecision(row(), NOW)).toBe("send")
  })

  it("a sending row is taken over at the lease, not before", () => {
    const sending = (age: number) =>
      row({ status: "SENDING", attempts: 1, claimedAt: ago(age) })
    expect(dueDecision(sending(LEASE_MS - 1000), NOW)).toBe("not-due")
    expect(dueDecision(sending(LEASE_MS), NOW)).toBe("send")
  })

  it("a failed row waits for the retry spacing", () => {
    const failed = (age: number) =>
      row({ status: "FAILED", attempts: 1, claimedAt: ago(age) })
    expect(dueDecision(failed(RETRY_AFTER_MS - 1000), NOW)).toBe("not-due")
    expect(dueDecision(failed(RETRY_AFTER_MS), NOW)).toBe("send")
  })

  it("a failed row is final at the attempt limit", () => {
    const failed = (attempts: number) =>
      row({ status: "FAILED", attempts, claimedAt: ago(10 * MIN) })
    expect(dueDecision(failed(MAX_ATTEMPTS - 1), NOW)).toBe("send")
    expect(dueDecision(failed(MAX_ATTEMPTS), NOW)).toBe("not-due")
  })

  it("sent and skipped rows are never due", () => {
    expect(dueDecision(row({ status: "SENT" }), NOW)).toBe("not-due")
    expect(dueDecision(row({ status: "SKIPPED" }), NOW)).toBe("not-due")
  })

  it("a due row 24 hours old is too old, 23:59:59 is not", () => {
    expect(
      dueDecision(row({ createdAt: ago(SEND_WINDOW_MS - 1000) }), NOW)
    ).toBe("send")
    expect(dueDecision(row({ createdAt: ago(SEND_WINDOW_MS) }), NOW)).toBe(
      "too-old"
    )
  })

  it("an old row that isn't due yet is left alone", () => {
    expect(
      dueDecision(
        row({
          status: "SENDING",
          attempts: 1,
          claimedAt: ago(MIN),
          createdAt: ago(SEND_WINDOW_MS + MIN),
        }),
        NOW
      )
    ).toBe("not-due")
  })
})

describe("isRetryableCode", () => {
  it.each([
    "timeout",
    "network",
    "http-429",
    "http-500",
    "http-503:x",
    "http-409:concurrent_idempotent_requests",
  ])("%s is retryable", (code) => expect(isRetryableCode(code)).toBe(true))

  it.each([
    "http-422:validation_error",
    "http-400",
    "http-401:x",
    "no-template",
    "too-old",
  ])("%s is final", (code) => expect(isRetryableCode(code)).toBe(false))
})

describe("timing", () => {
  it("keeps the transport timeout well inside the lease", () => {
    expect(TRANSPORT_TIMEOUT_MS * 2).toBeLessThan(LEASE_MS)
  })
})

// docs/specs/043-order-fulfillment-transitions: R9
describe("the cap exemption", () => {
  it("never skips a staff-triggered type, however many are counted", () => {
    for (const type of [
      "ORDER_SHIPPED",
      "ORDER_DELIVERED",
      "READY_FOR_PICKUP",
    ]) {
      expect(capDecision(0, type)).toBe("send")
      expect(capDecision(5, type)).toBe("send")
      expect(capDecision(50, type)).toBe("send")
    }
  })

  it("is exactly those three types", () => {
    expect([...CAP_EXEMPT_TYPES].sort()).toEqual([
      "ORDER_DELIVERED",
      "ORDER_SHIPPED",
      "READY_FOR_PICKUP",
    ])
  })

  it("still skips every other type at the cap, and a call with no type", () => {
    for (const type of [
      "ORDER_PLACED",
      "PAYMENT_RECEIVED",
      "ORDER_CANCELLED",
      "COD_CONFIRM",
    ]) {
      expect(capDecision(4, type)).toBe("send")
      expect(capDecision(5, type)).toBe("skip")
    }
    expect(capDecision(5)).toBe("skip")
  })
})
