import { revalidateTag } from "next/cache"

import { lockCart, touch } from "@/lib/cart/tx"
import { reviewDigest } from "@/lib/checkout/digest"
import { computeReview } from "@/lib/checkout/review-checkout"
import { db } from "@/lib/db"
import { PRODUCTS_TAG } from "@/lib/home"
import { PSGC_VERSION } from "@/lib/psgc/version"
import { toDbZone } from "@/lib/shipping/zone-enum"

import { placeOrderInputSchema } from "./input"
import { logSafeFailure } from "./log"
import { newOrderNumber } from "./number"
import { hashCartId, hashToken, tokenMatches } from "./secrets"

// Place an order (docs/specs/030-place-an-order, Behavior 7–15, §4 Placement;
// ADR 0009). The one writer of an order: the server action only forwards here.
// Everything happens in one transaction and a refusal leaves nothing behind:
//
//   lock the cart → replay check → the review's own checks → compare the
//   digest → take the stock → insert the order → its items → the stock
//   movements → empty the cart
//
// Anyone can reach the action, so nothing is trusted: the cart is the
// cookie's, the prices and totals are recomputed, and the idempotency key and
// access token must be exactly what the server mints. Neither is ever logged.

export type PlaceResult =
  | {
      ok: true
      orderNumber: string
      // The caller builds the link; only its hash is stored
      accessToken: string
    }
  | { ok: false; reason: "changed" | "empty" | "duplicate" | "error" }
  | { ok: false; reason: "invalid"; fields: Record<string, string> }

export type PlaceStep =
  | "lock"
  | "replay"
  | "checks"
  | "stock"
  | "order"
  | "items"
  | "movements"
  | "cart"

export type PlaceOptions = {
  // Tests pass a fixed clock and a number source that collides
  now?: Date
  newNumber?: () => string
  // Test seam: runs after each step inside the transaction, so a test can make
  // a later step fail and check that nothing was written
  afterStep?: (step: PlaceStep) => void | Promise<void>
}

// A refusal thrown inside the transaction to roll it back; caught outside.
// It carries no values, only the answer.
class Refusal extends Error {
  constructor(readonly result: Extract<PlaceResult, { ok: false }>) {
    super("refused")
    this.name = "Refusal"
  }
}

const refuse = (reason: "changed" | "empty" | "duplicate") =>
  new Refusal({ ok: false, reason })

// How often a taken order number is retried (40 bits make a clash rare)
const NUMBER_ATTEMPTS = 3

// The database's transaction limits: Neon's pooler and a cold start need more
// than Prisma's 5 s
const TRANSACTION = { maxWait: 5_000, timeout: 15_000 } as const

type Line = {
  productId: string
  name: string
  unitPrice: number
  quantity: number
  buildId: string | null
  slot: string | null
}

// The order's lines in cart order, and a group's parts in builder slot order
function orderLines(
  entries: Parameters<typeof reviewDigest>[0]["view"]["entries"]
): Line[] {
  const lines: Line[] = []
  for (const entry of entries) {
    if (entry.kind === "single") {
      lines.push({
        productId: entry.productId,
        name: entry.name,
        unitPrice: entry.unitPrice,
        quantity: entry.quantity,
        buildId: null,
        slot: null,
      })
      continue
    }
    for (const { slot, rows } of entry.slots) {
      for (const row of rows) {
        if (row.kind !== "part") continue
        lines.push({
          productId: row.data.part.id,
          name: row.data.part.name,
          unitPrice: row.data.effectivePrice,
          quantity: row.quantity,
          buildId: entry.buildId,
          slot,
        })
      }
    }
  }
  return lines
}

export async function placeOrder(
  cartId: string | null,
  input: unknown,
  { now = new Date(), newNumber = newOrderNumber, afterStep }: PlaceOptions = {}
): Promise<PlaceResult> {
  const parsed = placeOrderInputSchema.safeParse(input)
  if (!parsed.success) {
    // Field errors for the details, by their path as the review keys them; a
    // bad digest, key or token has no field to show
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const [first, ...rest] = issue.path
      const key = first === "details" ? rest.join(".") : ""
      if (!(key in fields)) fields[key] = issue.message
    }
    return { ok: false, reason: "invalid", fields }
  }
  const { details, digest, idempotencyKey, accessToken } = parsed.data
  if (!cartId) return { ok: false, reason: "empty" }

  const step = async (name: PlaceStep) => {
    await afterStep?.(name)
  }

  try {
    const placed = await db.$transaction(async (tx) => {
      // 1. Lock the cart: a cart change in another tab either lands before the
      //    checks or waits
      if (!(await lockCart(tx, cartId))) throw refuse("empty")
      await step("lock")

      // 2. Replay (D2, D14): this cart already placed an order with this key
      const earlier = await tx.order.findFirst({
        where: { idempotencyKey, cartIdHash: hashCartId(cartId) },
        select: { orderNumber: true, accessTokenHash: true },
      })
      if (earlier) {
        if (!tokenMatches(accessToken, earlier.accessTokenHash)) {
          throw refuse("duplicate")
        }
        return { orderNumber: earlier.orderNumber, replay: true }
      }
      await step("replay")

      // 3. The review's own checks on the locked cart, then the comparison
      //    with what the shopper saw
      const core = await computeReview(tx, cartId, details)
      if (!core.ok) {
        throw core.reason === "invalid"
          ? new Refusal({ ok: false, reason: "invalid", fields: core.fields })
          : refuse("empty")
      }
      const { review, address } = core
      if (!review.canPlace || !review.shipping.ok || review.total === null) {
        throw refuse("changed")
      }
      if (reviewDigest(review) !== digest) throw refuse("changed")
      await step("checks")

      // 4. Take the stock: one conditional update per product, in id order.
      //    The update reports the price it saw; a price that moved since the
      //    checks refuses instead of being written.
      const lines = orderLines(review.view.entries)
      const totals = new Map<string, { quantity: number; unitPrice: number }>()
      for (const line of lines) {
        const held = totals.get(line.productId)
        if (held && held.unitPrice !== line.unitPrice) throw refuse("changed")
        totals.set(line.productId, {
          quantity: (held?.quantity ?? 0) + line.quantity,
          unitPrice: line.unitPrice,
        })
      }
      const ids = [...totals.keys()].sort()
      for (const id of ids) {
        const { quantity, unitPrice } = totals.get(id)!
        const taken = await tx.$queryRaw<{ effectivePrice: number }[]>`
          UPDATE "Product"
          SET "stock" = "stock" - ${quantity}, "updatedAt" = now()
          WHERE "id" = ${id} AND "status" = 'ACTIVE' AND "stock" >= ${quantity}
          RETURNING "effectivePrice"`
        if (taken.length === 0 || taken[0].effectivePrice !== unitPrice) {
          throw refuse("changed")
        }
      }
      await step("stock")

      // The subtotal is the sum of the lines the order will hold
      const subtotal = lines.reduce(
        (sum, line) => sum + line.unitPrice * line.quantity,
        0
      )
      if (subtotal !== review.subtotal) {
        throw new Error("order lines don't add up to the subtotal")
      }

      // 5. Insert the order. ON CONFLICT DO NOTHING with no target: a clash on
      //    the key, the token hash or the number comes back as no row, and a
      //    transaction can't catch a unique violation (ADR 0007).
      const base = {
        accessTokenHash: hashToken(accessToken),
        idempotencyKey,
        cartIdHash: hashCartId(cartId),
        fulfillment: address ? ("DELIVERY" as const) : ("PICKUP" as const),
        guestEmail: details.contact.email,
        contactName: details.contact.name,
        contactMobile: details.contact.mobile,
        ...(address
          ? {
              regionCode: address.region.code,
              regionName: address.region.name,
              provinceCode: address.province.code,
              provinceName: address.province.name,
              provinceIsGeographic: address.province.geographic,
              cityCode: address.city.code,
              cityName: address.city.name,
              barangayCode: address.barangay.code,
              barangayName: address.barangay.name,
              street: address.street,
              zip: address.zip,
              psgcVersion: PSGC_VERSION,
              zone: toDbZone[address.zone],
            }
          : {}),
        weightGrams: review.weightGrams,
        subtotal,
        shippingFee: review.shipping.fee,
        discount: 0,
        total: review.total,
        expiresAt: new Date(now.getTime() + core.holdHours * 3_600_000),
      }
      let order: { id: string; orderNumber: string } | null = null
      for (let attempt = 0; attempt < NUMBER_ATTEMPTS && !order; attempt++) {
        const [inserted] = await tx.order.createManyAndReturn({
          data: [{ ...base, orderNumber: newNumber() }],
          skipDuplicates: true,
          select: { id: true, orderNumber: true },
        })
        if (inserted) {
          order = inserted
          break
        }
        // No row: the key belongs to another cart's order (this cart's own
        // was ruled out above, and it was committed after we started if it
        // is here now), or the number was taken
        const clash = await tx.order.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        })
        if (clash) throw refuse("duplicate")
      }
      if (!order) throw new Error("no free order number")
      await step("order")

      await tx.orderItem.createMany({
        data: lines.map((line, position) => ({
          orderId: order.id,
          productId: line.productId,
          nameSnapshot: line.name,
          priceSnapshot: line.unitPrice,
          quantity: line.quantity,
          buildId: line.buildId,
          slot: line.slot,
          position,
        })),
      })
      await step("items")

      // 6. One movement per product, with the quantity the stock changed by
      await tx.stockMovement.createMany({
        data: ids.map((id) => ({
          productId: id,
          change: -totals.get(id)!.quantity,
          reason: "ORDER_RESERVED" as const,
          orderId: order.id,
        })),
      })
      await step("movements")

      // 7. Empty the cart. The Cart row and the cookie stay.
      await tx.cartItem.deleteMany({ where: { cartId } })
      await touch(tx, cartId)
      await step("cart")

      return { orderNumber: order.orderNumber, replay: false }
    }, TRANSACTION)

    // The home page shows stock, so it must be refreshed. The order stands
    // whatever this does.
    if (!placed.replay) {
      try {
        revalidateTag(PRODUCTS_TAG, "max")
      } catch (error) {
        logSafeFailure("Revalidating products after an order", error)
      }
    }
    return { ok: true, orderNumber: placed.orderNumber, accessToken }
  } catch (error) {
    if (error instanceof Refusal) return error.result
    logSafeFailure("Place order", error)
    return { ok: false, reason: "error" }
  }
}
