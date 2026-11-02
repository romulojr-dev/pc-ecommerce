import { describe, expect, it } from "vitest"

import { linkAfterStart } from "./pay-link"
import type { StartResult } from "./start-payment"

// docs/specs/031-pay-with-xendit, behavior 2 and 5; docs/specs/034-start-
// payment-outside-transaction, behavior 8

const link = "/orders/PCS-7KQ2M9XD?key=abc"

describe("linkAfterStart", () => {
  it.each(["error", "expired"] as const)(
    "adds payment=error after %s",
    (reason) => {
      expect(linkAfterStart(link, { ok: false, reason })).toBe(
        `${link}&payment=error`
      )
    }
  )

  it.each([
    "opening",
    "confirming",
    "not-pending",
    "needs-check",
    "not-found",
  ] as const satisfies Extract<StartResult, { ok: false }>["reason"][])(
    "keeps the plain link after %s",
    (reason) => {
      expect(linkAfterStart(link, { ok: false, reason })).toBe(link)
    }
  )
})
