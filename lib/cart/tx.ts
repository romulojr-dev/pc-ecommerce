import type { Prisma } from "@/generated/prisma/client"

import { cartCount } from "./count"
import type { CartFailure, CartResult } from "./types"

// What the cart's write functions share (docs/specs/025-cart-single-items and
// docs/specs/026-add-build-to-cart): the transaction client, the outcome an
// action settles, and the cart row's lock. Every write to a cart runs in one
// transaction that locks the cart row first, so the stock cap is computed on
// the cart as it is.

export type Tx = Prisma.TransactionClient

// What a write hands back: the result for the client, and what to do with the
// cookie. Only a result that changed the cart renews it (spec 025 Behavior 3).
export type CartOutcome<Result = CartResult> = {
  result: Result
  // The cart's id: the existing one, or the one just made. Set the cookie to
  // it when renewCookie is true.
  cartId: string | null
  renewCookie: boolean
}

export const failed = (reason: CartFailure): CartOutcome => ({
  result: { ok: false, reason },
  cartId: null,
  renewCookie: false,
})

// Locks the cart row until the transaction ends, so two writes to one cart
// run one after the other (spec 025 Rules › Concurrency). False when there is
// no such cart.
export async function lockCart(tx: Tx, cartId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Cart" WHERE "id" = ${cartId} FOR UPDATE`
  return rows.length > 0
}

// What the product's quantity in the cart's build groups is: the cap counts
// it, but a single line can't change it
export async function quantityInGroups(
  tx: Tx,
  cartId: string,
  productId: string
): Promise<number> {
  const { _sum } = await tx.cartItem.aggregate({
    where: { cartId, productId, buildId: { not: null } },
    _sum: { quantity: true },
  })
  return _sum.quantity ?? 0
}

// Marks the cart as in use and returns its count
export async function touch(tx: Tx, cartId: string): Promise<number> {
  await tx.$executeRaw`
    UPDATE "Cart" SET "updatedAt" = now() WHERE "id" = ${cartId}`
  return cartCount(
    await tx.cartItem.findMany({
      where: { cartId },
      select: { quantity: true, buildId: true },
    })
  )
}

export const logFailure = (action: string, error: unknown) =>
  console.error(`${action} failed:`, error)
