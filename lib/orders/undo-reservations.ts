import type { Prisma } from "@/generated/prisma/client"

// Undoing an order's stock reservations (docs/specs/033-release-unpaid-orders
// D9; docs/specs/044-admin-cancel-order, B17, R1). The one place that reads
// `ORDER_RESERVED` movements and gives their stock back; the release and
// Admin's cancel both call it, in their own transaction.
//
// Row for row: one `ORDER_RELEASED` movement per reservation, and one stock
// UPDATE per product in id order (the order placement takes them in), retired
// products included. An order with no reservation row returns nothing.
// `actorId` is the staff member who cancelled; the release passes none.
export async function undoReservations(
  tx: Prisma.TransactionClient,
  orderIds: string[],
  { actorId }: { actorId?: string } = {}
): Promise<{ withReservation: Set<string> }> {
  if (orderIds.length === 0) return { withReservation: new Set() }
  const reserved = await tx.stockMovement.findMany({
    where: { orderId: { in: orderIds }, reason: "ORDER_RESERVED" },
    select: { orderId: true, productId: true, change: true },
  })
  const back = new Map<string, number>()
  for (const { productId, change } of reserved) {
    back.set(productId, (back.get(productId) ?? 0) - change)
  }
  for (const productId of [...back.keys()].sort()) {
    await tx.$executeRaw`
      UPDATE "Product"
      SET "stock" = "stock" + ${back.get(productId)!}, "updatedAt" = now()
      WHERE "id" = ${productId}`
  }
  if (reserved.length > 0) {
    await tx.stockMovement.createMany({
      data: reserved.map(({ orderId, productId, change }) => ({
        productId,
        change: -change,
        reason: "ORDER_RELEASED" as const,
        orderId,
        ...(actorId ? { actorId } : {}),
      })),
    })
  }
  return {
    withReservation: new Set(
      reserved.flatMap(({ orderId }) => (orderId ? [orderId] : []))
    ),
  }
}
