import type { Prisma } from "@/generated/prisma/client"

// A voucher's use count (docs/specs/037-vouchers-at-checkout, Behavior 16,
// 18). Both functions run in the caller's transaction: the use is taken when an
// order is placed and given back when the release cancels it.

export type VoucherTerms = {
  type: "FIXED" | "PERCENT"
  value: number
  minSpend: number
}

// Counts one use with a single conditional UPDATE: the limit and the dates are
// in the WHERE, so two placements racing for the last use cannot both win (the
// second waits on the row, re-reads it and gets no row). `now` is the
// placement's one clock, bound here and nowhere else (D10). Returns the terms
// the use was counted against, so the caller can refuse when they differ from
// what the review used, or null when there was no row to update.
export async function takeVoucherUse(
  tx: Prisma.TransactionClient,
  { id, now }: { id: string; now: Date }
): Promise<VoucherTerms | null> {
  const rows = await tx.$queryRaw<VoucherTerms[]>`
    UPDATE "Voucher"
    SET "usedCount" = "usedCount" + 1, "updatedAt" = ${now}
    WHERE "id" = ${id}
      AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")
      AND "startsAt" <= ${now}
      AND ("endsAt" IS NULL OR "endsAt" > ${now})
    RETURNING "type", "value", "minSpend"`
  return rows[0] ?? null
}

// Gives back one use per cancelled order that held a voucher, whatever the
// voucher's dates are now. One update per voucher, in id order (after the
// stock updates, so the lock order is products, then vouchers). The
// `usedCount >= 0` CHECK is the backstop: a count that would go below zero is
// a bug and fails the transaction. Returns how many uses went back.
export async function giveBackVoucherUses(
  tx: Prisma.TransactionClient,
  orderIds: string[]
): Promise<number> {
  if (orderIds.length === 0) return 0
  const held = await tx.order.findMany({
    where: { id: { in: orderIds }, voucherId: { not: null } },
    select: { voucherId: true },
  })
  const back = new Map<string, number>()
  for (const { voucherId } of held) {
    if (voucherId) back.set(voucherId, (back.get(voucherId) ?? 0) + 1)
  }
  for (const voucherId of [...back.keys()].sort()) {
    await tx.$executeRaw`
      UPDATE "Voucher"
      SET "usedCount" = "usedCount" - ${back.get(voucherId)!}, "updatedAt" = now()
      WHERE "id" = ${voucherId}`
  }
  return held.length
}
