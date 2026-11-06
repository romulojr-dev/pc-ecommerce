// "Needs payment review" (docs/specs/048-admin-dashboard, R6): an order whose
// payment arrived late, twice or for the wrong amount (a payment with a
// `problem`), or that is waiting for a refund (`refundRequired`). The
// dashboard counts these now; #111 adds "not yet reviewed" to this rule and to
// `needsReviewCondition` ([review-sql.ts]) together. Pure: no database.
export const needsReview = (order: {
  refundRequired: boolean
  payments: { problem: string | null }[]
}): boolean =>
  order.refundRequired || order.payments.some((p) => p.problem !== null)
