import type { StartResult } from "./start-payment"

// Where Place order leaves the shopper when no payment page opened
// (docs/specs/031-pay-with-xendit, behavior 2 and 5): the order link, with
// `payment=error` when the session couldn't open or the order is too close to
// its deadline, and plain otherwise (the order page then shows its status).
// Used by placeOrderAction and by the checkout after waiting for a session
// another start was opening (docs/specs/034-start-payment-outside-
// transaction, behavior 8). Pure.
export function linkAfterStart(
  link: string,
  result: Extract<StartResult, { ok: false }>
): string {
  const failed = result.reason === "error" || result.reason === "expired"
  return failed ? `${link}&payment=error` : link
}
