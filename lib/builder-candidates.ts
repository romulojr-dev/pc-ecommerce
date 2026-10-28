import type { BuilderCandidate } from "@/lib/build-state/candidates"
import type { Slot } from "@/lib/builder"
import { builderPartSelect, toBuilderPartData } from "@/lib/builder-parts"
import { db } from "@/lib/db"
import { productCardSelect, toProductCardData } from "@/lib/products"

// The slot picker's candidates (docs/specs/021-slot-picker, Rules ›
// Candidates; ADR 0006): every active product of the slot's category, with
// what the rules and a slot row need and what its card shows. Read on every
// call (ADR 0003: per-request data). The browser checks, groups and sorts
// them, so their order here doesn't matter.
export async function getBuilderCandidates(
  slot: Slot,
  today: string
): Promise<BuilderCandidate[]> {
  const rows = await db.product.findMany({
    where: { status: "ACTIVE", category: { slug: slot } },
    select: { ...productCardSelect, ...builderPartSelect },
    orderBy: { id: "asc" },
  })
  return rows.flatMap((row) => {
    const data = toBuilderPartData(row, today)
    return data ? [{ data, card: toProductCardData(row) }] : []
  })
}
