import type { BuilderCandidate } from "@/lib/build-state/candidates"
import type { AnyBuildPart, Slot } from "@/lib/builder"
import { slugify } from "@/lib/slug"
import { specSummary } from "@/lib/specs"
import { getStockStatus } from "@/lib/stock"
import { seedFiles } from "@/prisma/seed/data"

import { seedPart } from "./seed-parts"

// The day the slot picker examples were computed on
// (docs/specs/021-slot-picker, Examples)
export const PICKER_TODAY = "2026-10-28"

type SeedRecord = {
  sku: string
  name: string
  brand: string
  price: number
  salePrice?: number
  stock: number
  lowStockAt?: number
  preorderShipsOn?: string
  slug?: string
}

// Fields a test can change, e.g. stock: 0 for a fixture (E27)
export type CandidateOverrides = Partial<
  Pick<SeedRecord, "stock" | "preorderShipsOn" | "price" | "salePrice">
>

const records = (slot: Slot) =>
  seedFiles.find((file) => file.category === slot)!
    .parts as readonly SeedRecord[]

// A seed part as the candidates route returns it, with its stock status on
// PICKER_TODAY. The SKU stands in for the product id, as in seed-parts.ts.
export function seedCandidate(
  slot: Slot,
  sku: string,
  overrides: CandidateOverrides = {}
): BuilderCandidate {
  const found = records(slot).find((record) => record.sku === sku)
  if (!found) throw new Error(`no ${slot} with sku ${sku} in the seed`)
  const record = { ...found, ...overrides }
  // seedPart ties category and specs per slot; a Slot-wide call loses that
  const part = seedPart(slot, sku) as AnyBuildPart
  const salePrice = record.salePrice ?? null
  const lowStockAt = record.lowStockAt ?? 5
  const preorderShipsOn = record.preorderShipsOn ?? null
  const slug = record.slug ?? slugify(record.name)
  return {
    data: {
      part,
      slug,
      brand: record.brand,
      price: record.price,
      salePrice,
      effectivePrice: salePrice ?? record.price,
      stock: record.stock,
      stockStatus: getStockStatus(
        { stock: record.stock, lowStockAt, preorderShipsOn },
        PICKER_TODAY
      ),
      image: null,
    },
    card: {
      name: record.name,
      slug,
      categorySlug: slot,
      brand: record.brand,
      price: record.price,
      salePrice,
      stock: record.stock,
      lowStockAt,
      preorderShipsOn,
      image: null,
      summary: specSummary(slot, part.specs),
    },
  }
}

// Every seed part of a category as candidates; `overrides` is keyed by SKU
export function seedCandidates(
  slot: Slot,
  overrides: Record<string, CandidateOverrides> = {}
): BuilderCandidate[] {
  return records(slot).map((record) =>
    seedCandidate(slot, record.sku, overrides[record.sku])
  )
}
