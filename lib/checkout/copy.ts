import { flagText, groupName } from "@/lib/cart/copy"
import { formatPeso } from "@/lib/format"
import { MIN_ONLINE_TOTAL } from "@/lib/payments/amount"
import type { VoucherRefusal } from "@/lib/vouchers"

import type { CodUnavailable } from "./cod-eligibility"
import type { ReviewProblem } from "./problems"

// Shopper copy for checkout steps 1 and 2 (docs/specs/029-checkout-steps, §5).
// Field errors are in input.ts, next to the schema that raises them.

export const STEP_COPY = {
  banner: "Test mode.",
  bannerText:
    "This is a demo store: no real payment is taken and no order is shipped.",
  stepsLabel: "Checkout steps",
  steps: ["Contact and delivery", "Review", "Payment"],
  contactHeading: "Contact and delivery",
  reviewHeading: "Review your order",
  loading: "Checking your order…",
  loadFailed: "Couldn't load your review.",
  tryAgain: "Try again",
  checkAgain: "Check again",
  checkedClean: "Checked just now. No problems found.",
  placeOrder: "Place order",
  placeSoon: "Placing orders is coming soon.",
  // Place order (docs/specs/030-place-an-order, §5)
  placing: "Placing your order…",
  placeChanged: "Your order changed. Review it again.",
  placeError: "We couldn't place your order. Nothing was ordered. Try again.",
  placeNetwork:
    "We couldn't confirm your order. Try again: if it went through, you'll go straight to it.",
  placeDuplicate: "This order was already placed.",
  warningsLead:
    "This build may still work. Check these warnings before you order.",
  pickupOff: "Store pickup isn't available right now. Choose delivery.",
} as const

// How long an unpaid order's parts are held, under Place order
export function holdText(hours: number): string {
  return `Your parts are held for ${hours === 1 ? "1 hour" : `${hours} hours`} after you place your order.`
}

// The voucher box on the review (docs/specs/037-vouchers-at-checkout, §5)
export const VOUCHER_COPY = {
  label: "Voucher code",
  apply: "Apply",
  applying: "Checking…",
  remove: "Remove",
  removing: "Removing…",
  empty: "Enter a code.",
  unknown: "We don't recognize that code. Check it and try again.",
  notStarted: "That code isn't active yet.",
  ended: "That code has ended.",
  usedUp: "That code has been used up.",
  failed: "We couldn't check that code. Try again.",
  // The polite live region while Apply or Remove is in flight
  checking: "Checking your code…",
} as const

export const voucherAppliedText = (code: string) => `${code} applied`

// Why a code was refused, as the shopper reads it
export function voucherRefusalText(refusal: VoucherRefusal): string {
  switch (refusal.reason) {
    case "unknown":
      return VOUCHER_COPY.unknown
    case "not-started":
      return VOUCHER_COPY.notStarted
    case "ended":
      return VOUCHER_COPY.ended
    case "used-up":
      return VOUCHER_COPY.usedUp
    case "min-spend":
      return `Spend ${formatPeso(refusal.shortBy)} more to use this code.`
    case "below-minimum":
      return `This code would bring your total below ${formatPeso(MIN_ONLINE_TOTAL)}, the least we can take online. Add to your cart or use another code.`
  }
}

// The Payment section of the review (docs/specs/038-cash-on-delivery, §5)
export const COD_COPY = {
  heading: "Payment",
  summaryLabel: "Payment",
  online: "Pay online",
  onlineHint: "GCash, Maya or card. You'll pay on the next page.",
  cashOnDelivery: "Cash on delivery",
  payOnPickup: "Pay on pickup",
  failed: "We couldn't update your payment choice. Try again.",
  fallback: "We've switched you to online payment.",
} as const

// The cash option's name: pay on pickup when the order is picked up
export const codOptionName = (pickup: boolean): string =>
  pickup ? COD_COPY.payOnPickup : COD_COPY.cashOnDelivery

// The line under the cash option when it can be chosen
export const codHint = (pickup: boolean, total: number): string =>
  pickup
    ? `Pay ${formatPeso(total)} at the store when you collect your order.`
    : `Pay ${formatPeso(total)} in cash when your order arrives.`

// The note under Place order when cash is chosen
export function codPlaceNote(hours: number): string {
  const time = hours === 1 ? "1 hour" : `${hours} hours`
  return `Your parts are held for ${time} after you place your order. Confirm your order from the email we send you, or it is cancelled.`
}

// Why cash isn't offered, as the shopper reads it. `regionName` is the
// delivery region; `limit` is the store's limit; `total` the order's.
export function codReasonText(
  reason: CodUnavailable,
  {
    pickup,
    regionName,
    limit,
    total,
  }: {
    pickup: boolean
    regionName: string | null
    limit: number | null
    total: number | null
  }
): string {
  const option = codOptionName(pickup)
  switch (reason.reason) {
    case "disabled":
      return `${option} isn't available right now.`
    case "pickup-off":
      return `${COD_COPY.payOnPickup} isn't available right now.`
    case "zone":
      return `${option} isn't available in ${regionName ?? "your region"}.`
    case "no-total":
      return `${option} isn't available until we can deliver to this address.`
    case "over-limit":
      return `${option} is for orders up to ${formatPeso(limit ?? 0)}. Your total is ${formatPeso(total ?? 0)}.`
  }
}

// A saved cash choice that is no longer offered: the reason, then the switch
export const codFallbackText = (reasonText: string): string =>
  `${reasonText} ${COD_COPY.fallback}`

export const CART_BUTTON_COPY = {
  flagged: "Fix or remove the lines marked above to check out.",
  errors:
    "A build in your cart has errors. Fix it in the builder or remove it to check out.",
} as const

export function problemsHeading(count: number): string {
  return count === 1
    ? "1 problem to fix before you can order"
    : `${count} problems to fix before you can order`
}

// One problem as a sentence. A build with errors is a lead-in: its messages
// follow as a list.
export function problemText(problem: ReviewProblem): string {
  switch (problem.kind) {
    case "line":
      return `${problem.name}: ${flagText(problem.flag)}`
    case "group-part":
      return `${groupName(problem.number)}: ${problem.name}: ${flagText(problem.flag)}`
    case "build-errors":
      return `${groupName(problem.number)} has errors:`
    case "no-rate":
      return `We can't deliver to ${problem.region} yet. Choose store pickup or another address.`
  }
}

// What the Shipping row says
export function shippingValue(
  shipping: { ok: true; fee: number; basis: string } | { ok: false }
): string {
  if (!shipping.ok) return "Not available"
  if (shipping.basis === "pickup") return "Free (pickup)"
  return shipping.fee === 0 ? "Free" : formatPeso(shipping.fee)
}

export function thresholdNote(threshold: number): string {
  return `Free shipping on orders of ${formatPeso(threshold)} or more.`
}

// The delivery address as the review shows it: the street, then the places
export function addressLines(address: {
  street: string
  zip: string
  barangay: string
  city: string
  province: string
  region: string
}): [string, string] {
  return [
    address.street,
    `${address.barangay}, ${address.city}, ${address.province}, ${address.region} ${address.zip}`,
  ]
}
