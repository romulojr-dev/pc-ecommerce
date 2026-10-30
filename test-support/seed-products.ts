import { seedFiles } from "@/prisma/seed/data"

// The seed's own weight and price for a part, for tests that add up an order
// (docs/specs/028-shipping-data-and-fee-rules, W and F examples). seed-parts.ts
// only carries what the builder rules read.
type SeedProduct = {
  sku: string
  name: string
  price: number
  salePrice?: number
  weightGrams: number
}

export function seedProduct(category: string, sku: string) {
  const file = seedFiles.find((seed) => seed.category === category)!
  const part = (file.parts as readonly SeedProduct[]).find(
    (seeded) => seeded.sku === sku
  )
  if (!part) throw new Error(`no ${category} with sku ${sku} in the seed`)
  return {
    name: part.name,
    weightGrams: part.weightGrams,
    // What the shopper pays (Product.effectivePrice)
    price: part.salePrice ?? part.price,
  }
}

export const ryzen5_7600 = () => seedProduct("cpu", "100-100001015BOX")
export const lancool216 = () => seedProduct("case", "LAN216X")

// Spec 001's Build A (buildA in seed-parts.ts), as products
export const buildAProducts = () => [
  ryzen5_7600(),
  seedProduct("motherboard", "90MB1BP0-M0AAY0"), // ASUS ROG Strix B650-A
  seedProduct("memory", "CMK32GX5M2B6000C30"), // Vengeance DDR5-6000 32 GB
  seedProduct("storage", "MZ-V9P1T0BW"), // Samsung 990 PRO 1TB
  seedProduct("gpu", "DUAL-RTX4060-O8G"), // ASUS Dual RTX 4060 OC
  lancool216(),
  seedProduct("psu", "MPE-5501-ACAAB"), // Cooler Master MWE 550
  seedProduct("cpu-cooler", "PA120 SE"), // Thermalright Peerless Assassin 120 SE
]
