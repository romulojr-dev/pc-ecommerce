import { env } from "@/lib/env"

// Whether placing orders is switched on (docs/specs/030-place-an-order, D13):
// off in Production until unpaid orders release their stock (#81), on in
// Preview, CI and local runs. Read on the server only: the review hands the
// browser the answer, and placeOrderAction checks it again before it does
// anything. It gates placing and nothing else; existing orders stay viewable.
export function ordersEnabled(): boolean {
  return env.ORDERS_ENABLED
}
