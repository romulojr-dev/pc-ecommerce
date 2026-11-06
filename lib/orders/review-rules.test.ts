import { expect, test } from "vitest"

import { needsReview } from "./review-rules"

// docs/specs/048-admin-dashboard: E24, R6
test("a payment problem or a pending refund needs review", () => {
  expect(needsReview({ refundRequired: false, payments: [] })).toBe(false)
  expect(
    needsReview({ refundRequired: false, payments: [{ problem: null }] })
  ).toBe(false)
  expect(
    needsReview({ refundRequired: false, payments: [{ problem: "LATE" }] })
  ).toBe(true)
  expect(needsReview({ refundRequired: true, payments: [] })).toBe(true)
})
