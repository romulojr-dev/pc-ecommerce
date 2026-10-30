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
