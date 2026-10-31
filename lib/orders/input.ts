import { z } from "zod"

import { checkoutInputSchema } from "@/lib/checkout/input"

import { keyShape, tokenShape } from "./secrets"

// What Place order sends (docs/specs/030-place-an-order, §4 Input, Formats):
// the checkout details of spec 029, the review's digest, and the idempotency
// key and access token the review handed out. The key and token must be
// exactly what the server mints (128 and 256 random bits, canonical
// base64url), so nothing weaker can ever be stored. Unknown fields are
// dropped, and prices, totals, status, user and cart ids are never read from
// the request.

export const placeOrderInputSchema = z.object({
  details: checkoutInputSchema,
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  idempotencyKey: z.string().refine(keyShape),
  accessToken: z.string().refine(tokenShape),
})

export type PlaceOrderInput = z.output<typeof placeOrderInputSchema>
