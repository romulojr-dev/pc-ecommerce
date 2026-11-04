import type { ShippingZone } from "@/lib/shipping/zones"

// Whether cash on delivery (pay on pickup for a pickup order) is offered for
// an order (docs/specs/038-cash-on-delivery, Behavior 4, FR-25). Pure: the
// review and the placement both ask it, with the same settings read through
// their own client, so what was offered and what is placed cannot differ.

// The COD part of the store settings
export type CodSettings = {
  codEnabled: boolean
  // Centavos; null means no limit
  codMaxTotal: number | null
  // Delivery zones where cash is allowed; empty means none
  codZones: readonly ShippingZone[]
  codPickupEnabled: boolean
}

// `total` is the review's own: subtotal - discount + shipping, the amount the
// courier collects. Null when delivery has no rate.
export type CodInput =
  | { method: "pickup"; total: number | null }
  | { method: "delivery"; zone: ShippingZone; total: number | null }

export type CodUnavailable =
  | { offered: false; reason: "disabled" }
  | { offered: false; reason: "pickup-off" }
  | { offered: false; reason: "zone" }
  | { offered: false; reason: "no-total" }
  // How far over the limit the total is, in centavos
  | { offered: false; reason: "over-limit"; overBy: number }

export type CodEligibility = { offered: true } | CodUnavailable

// The first failure of: switched on, pickup allowed (pickup), zone allowed
// (delivery), a total to compare, within the limit. The most general cause is
// reported first (spec 038 D14). Equal to the limit is allowed.
export function codEligibility(
  input: CodInput,
  settings: CodSettings
): CodEligibility {
  if (!settings.codEnabled) return { offered: false, reason: "disabled" }
  if (input.method === "pickup") {
    if (!settings.codPickupEnabled) {
      return { offered: false, reason: "pickup-off" }
    }
  } else if (!settings.codZones.includes(input.zone)) {
    return { offered: false, reason: "zone" }
  }
  if (input.total === null) return { offered: false, reason: "no-total" }
  const limit = settings.codMaxTotal
  if (limit !== null && input.total > limit) {
    return { offered: false, reason: "over-limit", overBy: input.total - limit }
  }
  return { offered: true }
}
