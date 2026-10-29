import type { BuilderPartData } from "@/lib/build-state/parts"
import type { SharedItem } from "@/lib/build-state/shared"
import type { AnyBuildPart, Build } from "@/lib/builder"
import type { StockStatus } from "@/lib/stock"

import { seed } from "./seed-parts"

// Snapshots of seed parts for the tests of the shared page's view and
// components (docs/specs/022-share-build). Pure: no database. Prices are seed
// prices in centavos.

const prices: Record<string, number> = {
  [seed.ryzen5_7600.id]: 1_149_500,
  [seed.ryzen7_9800x3d.id]: 2_999_500,
  [seed.ultra7_265k.id]: 2_099_500,
  [seed.strixB650a.id]: 1_499_500,
  [seed.vengeanceDdr5.id]: 649_500,
  [seed.pro990.id]: 699_500,
  [seed.mx500.id]: 449_500,
  [seed.rtx4060.id]: 1_799_500,
  [seed.rtx5090Astral.id]: 17_999_500,
  [seed.lancool216.id]: 579_500,
  [seed.mwe550.id]: 299_500,
  [seed.rm850e.id]: 749_500,
  [seed.peerless.id]: 229_500,
}

export function data(
  part: AnyBuildPart,
  stockStatus: StockStatus = "in-stock"
): BuilderPartData {
  const price = prices[part.id] ?? 100_000
  return {
    part,
    slug: part.id,
    brand: "Brand",
    price,
    salePrice: null,
    effectivePrice: price,
    stock: 10,
    stockStatus,
    image: null,
  }
}

export type SnapshotOptions = {
  quantity?: Record<string, number>
  status?: Record<string, StockStatus>
  retired?: AnyBuildPart[]
}

// A snapshot of the parts, with some of them no longer sold
export function snapshot(
  parts: AnyBuildPart[],
  { quantity = {}, status = {}, retired = [] }: SnapshotOptions = {}
): SharedItem[] {
  return parts.map((part): SharedItem => {
    const slot = part.category
    if (retired.includes(part)) {
      return {
        slot,
        quantity: quantity[part.id] ?? 1,
        state: "retired",
        id: part.id,
        name: part.name,
        brand: "Brand",
      }
    }
    return {
      slot,
      quantity: quantity[part.id] ?? 1,
      state: "available",
      data: data(part, status[part.id]),
    }
  })
}

export const partsOf = (build: Build) =>
  Object.values(build).flatMap((entries) =>
    (entries ?? []).map((entry) => entry.part as AnyBuildPart)
  )
