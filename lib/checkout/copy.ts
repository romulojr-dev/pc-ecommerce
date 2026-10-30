import { flagText, groupName } from "@/lib/cart/copy"
import { formatPeso } from "@/lib/format"

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
  warningsLead:
    "This build may still work. Check these warnings before you order.",
  pickupOff: "Store pickup isn't available right now. Choose delivery.",
} as const

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
