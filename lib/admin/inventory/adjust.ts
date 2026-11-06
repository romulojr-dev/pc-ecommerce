import "server-only"

import { adminTransaction, recordAudit } from "../audit"
import type { AdminActor } from "../guard"
import {
  type AdjustmentErrors,
  type AdjustStockInput,
  MAX_STOCK,
  type SetLowStockAtInput,
  validateAdjustment,
  validateThreshold,
} from "../inventory-input"

// Adjusting stock and the low-stock threshold (docs/specs/046-admin-
// inventory-adjustments, B9–B13, R1–R7, R16). The server actions only forward
// here, after the guard has checked the origin, the session and `can()`.
//
// An adjustment is ONE conditional UPDATE of the signed delta, with the whole
// range check in its WHERE (stock + delta BETWEEN 0 AND 1,000,000), so it can
// never overwrite a concurrent order's decrement, go negative, or pass the
// ceiling together with another adjustment: the row lock serialises them and
// each re-checks the WHERE on the new row version. Then, in the SAME
// transaction, the StockMovement and the audit row. Nothing here calls an
// outside service. The caller invalidates the product cache with updateTag
// after an `adjusted` or `saved` result.

export type Refusal = { kind: "too-low" | "too-high"; stock: number }

export type AdjustResult =
  | { kind: "adjusted"; stock: number; delta: number; movementId: string }
  | { kind: "invalid"; errors: AdjustmentErrors }
  // Nothing written; `stock` is what it is now
  | { kind: "refused"; refusal: Refusal }
  | { kind: "not-found" }

export type AdjustStep = "stock" | "movement"

export type AdjustOptions = {
  // Test seam: runs after each step inside the transaction, so a test can hold
  // it open to force an interleaving, or make a later step fail and check
  // that nothing was written
  afterStep?: (step: AdjustStep) => void | Promise<void>
}

export async function adjustStock(
  actor: AdminActor,
  input: AdjustStockInput,
  options: AdjustOptions = {}
): Promise<AdjustResult> {
  const checked = validateAdjustment(input)
  if (!checked.ok) return { kind: "invalid", errors: checked.errors }
  const { reason, delta, note } = checked.value
  const productId = input.productId

  return adminTransaction(async (tx): Promise<AdjustResult> => {
    const updated = await tx.$queryRaw<{ stock: number }[]>`
      UPDATE "Product"
      SET "stock" = "stock" + ${delta}, "updatedAt" = now()
      WHERE "id" = ${productId}
        AND "stock" + ${delta} BETWEEN 0 AND ${MAX_STOCK}
      RETURNING "stock"`
    if (updated.length === 0) {
      // Nothing was written. Say why, with the stock as it is now.
      const current = await tx.product.findUnique({
        where: { id: productId },
        select: { stock: true },
      })
      if (!current) return { kind: "not-found" }
      return {
        kind: "refused",
        refusal: {
          kind: current.stock + delta < 0 ? "too-low" : "too-high",
          stock: current.stock,
        },
      }
    }
    const stock = updated[0].stock
    await options.afterStep?.("stock")

    const movement = await tx.stockMovement.create({
      data: { productId, change: delta, reason, actorId: actor.id, note },
      select: { id: true },
    })
    await options.afterStep?.("movement")

    await recordAudit(tx, {
      actorId: actor.id,
      entity: "product",
      entityId: productId,
      action: "stock-adjusted",
      before: { stock: stock - delta },
      after: { stock, reason, ...(note ? { note } : {}) },
    })
    return { kind: "adjusted", stock, delta, movementId: movement.id }
  })
}

export type ThresholdResult =
  | { kind: "saved"; lowStockAt: number }
  | { kind: "unchanged"; lowStockAt: number }
  | { kind: "invalid"; error: string }
  | { kind: "not-found" }

// A setting, not a count: it is set, not added (D6). It reads the old value
// under the row lock for the audit row's "before"; Product.editVersion is not
// touched, so an open product form is not made stale (B17).
export async function setLowStockAt(
  actor: AdminActor,
  input: SetLowStockAtInput
): Promise<ThresholdResult> {
  const checked = validateThreshold(input.lowStockAt)
  if (!checked.ok) return { kind: "invalid", error: checked.error }
  const lowStockAt = checked.value
  const productId = input.productId

  return adminTransaction(async (tx): Promise<ThresholdResult> => {
    const rows = await tx.$queryRaw<{ lowStockAt: number }[]>`
      SELECT "lowStockAt" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`
    if (rows.length === 0) return { kind: "not-found" }
    const before = rows[0].lowStockAt
    if (before === lowStockAt) return { kind: "unchanged", lowStockAt }

    await tx.$executeRaw`
      UPDATE "Product"
      SET "lowStockAt" = ${lowStockAt}, "updatedAt" = now()
      WHERE "id" = ${productId}`
    await recordAudit(tx, {
      actorId: actor.id,
      entity: "product",
      entityId: productId,
      action: "updated",
      before: { lowStockAt: before },
      after: { lowStockAt },
    })
    return { kind: "saved", lowStockAt }
  })
}
