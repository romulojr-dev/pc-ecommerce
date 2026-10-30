import { contentHashOf } from "@/lib/build-share-hash"
import { upsertBuildSnapshot } from "@/lib/build-snapshot"
import { shareInput } from "@/lib/build-state/share"
import { SLOT_COPY } from "@/lib/build-state/slots"
import { unacknowledged } from "@/lib/build-state/warnings"
import {
  assembleBuild,
  canonicalItems,
  checkBuild,
  SLOTS,
  type BuildItem,
} from "@/lib/builder"
import { getBuilderParts } from "@/lib/builder-parts"
import { db } from "@/lib/db"
import { isBuyable, manilaToday } from "@/lib/stock"

import { type BuildNeed, buildShortages } from "./build-stock"
import { addBuildInputSchema, removeBuildInputSchema } from "./input"
import { newCartId } from "./id"
import { type CartOutcome, failed, lockCart, logFailure, touch } from "./tx"
import type { BuildCartResult, UnavailablePart } from "./types"

// Add build to cart (docs/specs/026-add-build-to-cart, Behavior 9–11). The
// server action only forwards here, and the integration tests call these
// directly with a cart id. Anyone can reach the action, so everything about
// the build is checked here and the client's own verdict is never read: the
// input is the items and the keys of the warnings the shopper confirmed.

type Options = {
  // The id from the cookie, or null when there is none or it isn't shaped
  // like one
  cartId: string | null
  // Manila's date, for pre-order status; tests pass a fixed one
  today?: string
  // Where the snapshot's random slugs come from; tests force collisions
  newSlug?: () => string
}

export type BuildCartOutcome = CartOutcome<BuildCartResult>

// A refusal changes nothing: no cart, no snapshot, no lines, no cookie
const refused = (result: BuildCartResult): BuildCartOutcome => ({
  result,
  cartId: null,
  renewCookie: false,
})

const slotIndex = (slot: string) => SLOTS.findIndex((known) => known === slot)

// The parts the server won't add, with the reason, in slot order (step 2):
// products that are gone, not active or in the wrong slot, and active ones
// that can't be bought today
async function unavailableParts(
  items: readonly BuildItem[],
  today: string
): Promise<{
  parts: UnavailablePart[]
  loaded: Awaited<ReturnType<typeof getBuilderParts>>
}> {
  const loaded = await getBuilderParts(
    items.map((item) => item.productId),
    today
  )
  const { changes } = assembleBuild(
    items,
    new Map(loaded.map((data) => [data.part.id, data.part]))
  )

  const gone = changes.flatMap((change) =>
    change.productId && change.slot
      ? [{ slot: change.slot, productId: change.productId }]
      : []
  )
  const names = new Map(
    (
      await db.product.findMany({
        where: { id: { in: gone.map((part) => part.productId) } },
        select: { id: true, name: true },
      })
    ).map((product) => [product.id, product.name])
  )

  const parts: (UnavailablePart & { slot: string })[] = [
    ...gone.map(({ slot, productId }) => ({
      slot,
      // A product nobody has is named by its slot
      name: names.get(productId) ?? SLOT_COPY[slot].item,
      why: "retired" as const,
    })),
    ...loaded
      .filter((data) => !isBuyable(data.stockStatus))
      .map((data) => ({
        slot: data.part.category,
        name: data.part.name,
        why: "not-buyable" as const,
      })),
  ]
  parts.sort((a, b) => slotIndex(a.slot) - slotIndex(b.slot))
  return {
    parts: parts.map(({ name, why }) => ({ name, why })),
    loaded,
  }
}

// Adds the build as one group. In order, stopping at the first failure
// (Behavior 9): input, parts, errors, already in the cart, stock, warnings,
// then the write. Nothing is written before the last step, so a refusal
// leaves no cart, no snapshot and no lines.
export async function addBuildToCart(
  input: unknown,
  { cartId, today = manilaToday(), newSlug }: Options,
  newId: () => string = newCartId
): Promise<BuildCartOutcome> {
  const parsed = addBuildInputSchema.safeParse(input)
  if (!parsed.success) return refused({ ok: false, reason: "invalid" })
  const { acknowledgedWarnings } = parsed.data

  const checked = shareInput(parsed.data.items)
  if (!checked.ok) return refused(checked)
  const { items } = checked

  try {
    const { parts: unavailable, loaded } = await unavailableParts(items, today)
    if (unavailable.length > 0) {
      return refused({ ok: false, reason: "unavailable", parts: unavailable })
    }

    const { build } = assembleBuild(
      items,
      new Map(loaded.map((data) => [data.part.id, data.part]))
    )
    const issues = checkBuild(build)
    const errors = issues.filter((issue) => issue.severity === "error")
    if (errors.length > 0) {
      return refused({ ok: false, reason: "errors", issues: errors })
    }

    const contentHash = contentHashOf(items)
    const productIds = items.map((item) => item.productId)
    const partById = new Map(loaded.map((data) => [data.part.id, data.part]))
    const needs: BuildNeed[] = items.map((item) => ({
      productId: item.productId,
      name: partById.get(item.productId)!.name,
      slot: item.slot,
      needs: item.quantity,
    }))

    return await db.$transaction(async (tx): Promise<BuildCartOutcome> => {
      // No cart, or one the database doesn't know, counts as an empty cart
      const existing = cartId && (await lockCart(tx, cartId)) ? cartId : null

      if (existing) {
        const there = await tx.cartItem.findFirst({
          where: { cartId: existing, build: { contentHash } },
          select: { id: true },
        })
        if (there) {
          return {
            cartId: existing,
            renewCookie: true,
            result: {
              ok: true,
              status: "already-in-cart",
              count: await touch(tx, existing),
            },
          }
        }
      }

      // Each product's total across the whole cart, and its stock now
      const held = existing
        ? await tx.cartItem.groupBy({
            by: ["productId"],
            where: { cartId: existing, productId: { in: productIds } },
            _sum: { quantity: true },
          })
        : []
      const stock = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, stock: true },
      })
      const shortages = buildShortages(
        needs,
        new Map(held.map((row) => [row.productId, row._sum.quantity ?? 0])),
        new Map(stock.map((row) => [row.id, row.stock]))
      )
      if (shortages.length > 0) {
        return refused({ ok: false, reason: "stock", shortages })
      }

      // Every warning of the build comes back, so the shopper confirms the
      // whole set when any of them is new to them
      if (unacknowledged(issues, acknowledgedWarnings).length > 0) {
        return refused({
          ok: false,
          reason: "confirm",
          warnings: issues.filter((issue) => issue.severity === "warning"),
        })
      }

      // The write
      let id = existing
      if (!id) {
        id = newId()
        await tx.$executeRaw`
          INSERT INTO "Cart" ("id", "updatedAt") VALUES (${id}, now())`
      }
      const snapshot = await upsertBuildSnapshot(tx, items, { newSlug })
      await tx.cartItem.createMany({
        data: canonicalItems(items).map(([, productId, quantity]) => ({
          cartId: id,
          productId,
          quantity,
          buildId: snapshot.id,
        })),
      })

      return {
        cartId: id,
        renewCookie: true,
        result: { ok: true, status: "added", count: await touch(tx, id) },
      }
    })
  } catch (error) {
    logFailure("addBuildToCart", error)
    return refused({ ok: false, reason: "error" })
  }
}

// Removes a whole build group (Behavior 17). Only the group's CartItems are
// deleted; the Build snapshot stays, because shared links and other carts use
// it (ADR 0007). Only the cookie's cart is searched.
export async function removeBuildFromCart(
  input: unknown,
  { cartId }: Options
): Promise<CartOutcome> {
  const parsed = removeBuildInputSchema.safeParse(input)
  if (!parsed.success) return failed("invalid")
  if (!cartId) return failed("not-found")
  const { buildId } = parsed.data

  try {
    return await db.$transaction(async (tx): Promise<CartOutcome> => {
      if (!(await lockCart(tx, cartId))) return failed("not-found")

      const { count: removed } = await tx.cartItem.deleteMany({
        where: { cartId, buildId },
      })
      if (removed === 0) return failed("not-found")

      return {
        cartId,
        renewCookie: true,
        result: { ok: true, count: await touch(tx, cartId), line: null },
      }
    })
  } catch (error) {
    logFailure("removeBuildFromCart", error)
    return failed("error")
  }
}
