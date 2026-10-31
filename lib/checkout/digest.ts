import { createHash } from "node:crypto"

import type { CheckoutReview } from "./review"

// The review digest (docs/specs/030-place-an-order, §4 Digest, D9): a
// fingerprint of what the shopper was shown that costs money. The review
// hands it out and Place order sends it back; the server recomputes it from a
// fresh review and refuses a placement when they differ. One function, called
// by both, so they can't drift. Not a secret and not signed: forging one that
// equals the fresh digest only confirms the shopper accepts the current state.
//
// It covers the lines (kind, build, slot, product, quantity, unit price), the
// shipping fee, the subtotal and the total. It leaves out names, flags, stock,
// warnings and the address text (the address fixes the zone, and the zone is
// in the fee). Lines are sorted, so cart order doesn't matter.

type Line = [
  kind: string,
  buildId: string,
  slot: string,
  productId: string,
  quantity: number,
  unitPrice: number,
]

export function reviewDigest(review: CheckoutReview): string {
  const lines: Line[] = []
  for (const entry of review.view.entries) {
    if (entry.kind === "single") {
      lines.push([
        "single",
        "",
        "",
        entry.productId,
        entry.quantity,
        entry.unitPrice,
      ])
      continue
    }
    for (const { slot, rows } of entry.slots) {
      for (const row of rows) {
        if (row.kind !== "part") continue
        lines.push([
          "build",
          entry.buildId,
          slot,
          row.data.part.id,
          row.quantity,
          row.data.effectivePrice,
        ])
      }
    }
  }
  lines.sort((a, b) => {
    const x = JSON.stringify(a)
    const y = JSON.stringify(b)
    return x < y ? -1 : x > y ? 1 : 0
  })

  const text = JSON.stringify({
    lines,
    shippingFee: review.shipping.ok ? review.shipping.fee : null,
    subtotal: review.subtotal,
    total: review.total,
  })
  return createHash("sha256").update(text, "utf8").digest("hex")
}
