import { z } from "zod"

import { MAX_CART_QUANTITY } from "./cap"

// What the cart actions accept (docs/specs/025-cart-single-items, Rules ›
// Input). Unknown keys are dropped: no cart id, price or count is ever read
// from the request. Quantity is a whole number from 1 to 99; "2" is not one.
const id = z.string().min(1).max(64)
const quantity = z.number().int().min(1).max(MAX_CART_QUANTITY)

export const addInputSchema = z.object({ productId: id, quantity })
export const setInputSchema = z.object({ lineId: id, quantity })
export const removeInputSchema = z.object({ lineId: id })

// Adding a build (docs/specs/026-add-build-to-cart, Behavior 9.1): the items
// and the keys of the warnings the shopper confirmed, and nothing else. The
// items are checked by shareInput, which owns their rules; the keys are
// opaque strings, bounded. A missing list means nothing was acknowledged.
export const MAX_ACKNOWLEDGED = 50
export const MAX_ACKNOWLEDGED_LENGTH = 200

export const addBuildInputSchema = z.object({
  items: z.unknown(),
  acknowledgedWarnings: z
    .array(z.string().max(MAX_ACKNOWLEDGED_LENGTH))
    .max(MAX_ACKNOWLEDGED)
    .default([]),
})
export const removeBuildInputSchema = z.object({ buildId: id })
