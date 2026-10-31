import { db } from "@/lib/db"
import type { DbClient } from "@/lib/db-client"
import { getCartView } from "@/lib/cart/cart"
import { logSafeFailure } from "@/lib/orders/log"
import { newAccessToken, newIdempotencyKey } from "@/lib/orders/secrets"
import { resolveAddress } from "@/lib/psgc/address"
import { getShippingConfig } from "@/lib/shipping/config"
import { manilaToday } from "@/lib/stock"

import { type PlaceAddress, failingLevel, normalizeAddress } from "./address"
import { STEP_COPY } from "./copy"
import { reviewDigest } from "./digest"
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
//
// The checks themselves are `computeReview`, which Place order runs again
// inside its transaction on the locked cart (docs/specs/030-place-an-order,
// Behavior 9), so what blocks the review blocks the order by construction.

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
      // What Place order sends back (docs/specs/030-place-an-order, Behavior
      // 2, D1): the fingerprint of the money, and a random idempotency key and
      // access token made for this review. Nothing is stored; neither is ever
      // logged.
      digest: string
      idempotencyKey: string
      accessToken: string
      // Hours an unpaid order's parts are held (the settings' expiry)
      holdHours: number
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

type CartView = Awaited<ReturnType<typeof getCartView>>

// Grams by product id for every product the cart holds, retired ones included
// (the review counts only the lines still sold)
async function weightsOf(
  view: CartView,
  client: DbClient
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
  const rows = await client.product.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, weightGrams: true },
  })
  return new Map(rows.map((row) => [row.id, row.weightGrams]))
}

export type ReviewCore =
  | {
      ok: true
      review: CheckoutReview
      address: CheckoutAddress | null
      store: { address: string; hours: string } | null
      holdHours: number
    }
  | { ok: false; reason: "invalid"; fields: Record<string, string> }
  | { ok: false; reason: "empty" }

// The review's checks on a cart and parsed details (Behavior 16–21 of spec
// 029): the cart view, the shipping config, the pickup setting, the address
// and the pure `buildReview`. Throws on a database error; the callers decide
// what to do with it. `client` is `db`, or the transaction a placement holds
// (reads inside it need no second connection).
export async function computeReview(
  client: DbClient,
  cartId: string | null,
  details: CheckoutInput
): Promise<ReviewCore> {
  const view = await getCartView(cartId, manilaToday(), client)
  if (view.entries.length === 0) return { ok: false, reason: "empty" }

  const config = await getShippingConfig(client)
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
    await weightsOf(view, client),
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
    address,
    store:
      details.method === "pickup"
        ? {
            address: config.settings.storeAddress,
            hours: config.settings.storeHours,
          }
        : null,
    holdHours: config.settings.orderExpiryHours,
  }
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
    const core = await computeReview(db, cartId, details)
    if (!core.ok) return core
    return {
      ok: true,
      review: core.review,
      contact: details.contact,
      address: core.address,
      store: core.store,
      digest: reviewDigest(core.review),
      idempotencyKey: newIdempotencyKey(),
      accessToken: newAccessToken(),
      holdHours: core.holdHours,
    }
  } catch (error) {
    // The details are personal: log what failed, never the payload or the
    // error's message
    logSafeFailure("Checkout review", error)
    return { ok: false, reason: "error" }
  }
}
