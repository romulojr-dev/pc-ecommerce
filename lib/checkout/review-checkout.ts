import { db } from "@/lib/db"
import { getCartView } from "@/lib/cart/cart"
import { resolveAddress } from "@/lib/psgc/address"
import { getShippingConfig } from "@/lib/shipping/config"

import { type PlaceAddress, failingLevel, normalizeAddress } from "./address"
import { STEP_COPY } from "./copy"
import {
  CHECKOUT_COPY,
  type CheckoutInput,
  checkoutInputSchema,
  fieldErrors,
} from "./input"
import { buildReview, type CheckoutReview } from "./review"

// The server side of step 2 (docs/specs/029-checkout-steps, Behavior 16–21,
// D1): re-checks the details and the cart on every call and builds the review.
// It only reads: no write, no lock, no cookie. Anyone can reach the action
// that calls it, so it trusts nothing it is given; the cart comes from the
// cookie's id, never from the request.

export type CheckoutAddress = PlaceAddress & { street: string; zip: string }

export type ReviewResult =
  | {
      ok: true
      review: CheckoutReview
      contact: CheckoutInput["contact"]
      // Delivery only: the places named by the dataset
      address: CheckoutAddress | null
      // Pickup only: the store's address and hours, as written
      store: { address: string; hours: string } | null
    }
  // `fields` are messages keyed by path ("contact.mobile",
  // "address.barangayCode", "method"); the form shows them and, for an
  // address level, clears it and the levels below
  | { ok: false; reason: "invalid"; fields: Record<string, string> }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "error" }

const AGAIN = {
  region: ["address.regionCode", CHECKOUT_COPY.regionAgain],
  province: ["address.provinceCode", CHECKOUT_COPY.provinceAgain],
  city: ["address.cityCode", CHECKOUT_COPY.cityAgain],
  barangay: ["address.barangayCode", CHECKOUT_COPY.barangayAgain],
} as const

// Grams by product id for every product the cart holds, retired ones included
// (the review counts only the lines still sold)
async function weightsOf(
  view: Awaited<ReturnType<typeof getCartView>>
): Promise<Map<string, number>> {
  const ids = new Set<string>()
  for (const entry of view.entries) {
    if (entry.kind === "single") ids.add(entry.productId)
    else {
      for (const { rows } of entry.slots) {
        for (const row of rows) {
          if (row.kind === "part") ids.add(row.data.part.id)
        }
      }
    }
  }
  const rows = await db.product.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, weightGrams: true },
  })
  return new Map(rows.map((row) => [row.id, row.weightGrams]))
}

export async function reviewCheckout(
  cartId: string | null,
  input: unknown
): Promise<ReviewResult> {
  const parsed = checkoutInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, reason: "invalid", fields: fieldErrors(parsed.error) }
  }
  const details = parsed.data

  try {
    const view = await getCartView(cartId)
    if (view.entries.length === 0) return { ok: false, reason: "empty" }

    const config = await getShippingConfig()
    if (details.method === "pickup" && !config.settings.pickupEnabled) {
      return {
        ok: false,
        reason: "invalid",
        fields: { method: STEP_COPY.pickupOff },
      }
    }

    let address: CheckoutAddress | null = null
    if (details.method === "delivery") {
      const codes = {
        regionCode: details.address.regionCode,
        provinceCode: details.address.provinceCode,
        cityCode: details.address.cityCode,
        barangayCode: details.address.barangayCode,
      }
      const resolved = await resolveAddress(codes)
      const places = resolved && (await normalizeAddress(resolved))
      if (!places) {
        const [key, message] = AGAIN[await failingLevel(codes)]
        return { ok: false, reason: "invalid", fields: { [key]: message } }
      }
      address = {
        ...places,
        street: details.address.street,
        zip: details.address.zip,
      }
    }

    const review = buildReview(
      view,
      await weightsOf(view),
      address
        ? {
            method: "delivery",
            zone: address.zone,
            regionName: address.region.name,
          }
        : { method: "pickup" },
      config
    )
    return {
      ok: true,
      review,
      contact: details.contact,
      address,
      store:
        details.method === "pickup"
          ? {
              address: config.settings.storeAddress,
              hours: config.settings.storeHours,
            }
          : null,
    }
  } catch (error) {
    // The details are personal: log what failed, never the payload
    console.error(
      "Checkout review failed:",
      error instanceof Error ? `${error.name}: ${error.message}` : "unknown"
    )
    return { ok: false, reason: "error" }
  }
}
