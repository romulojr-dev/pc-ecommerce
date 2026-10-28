import type { AnyBuildPart, Build, BuildPart, Slot } from "@/lib/builder"
import type { Specs } from "@/lib/specs"
import { seedFiles } from "@/prisma/seed/data"

// Real seed parts for builder tests (docs/specs/018-compatibility-rules,
// "Test plan"), so a data change that alters a scenario breaks a test. The
// SKU stands in for the product id. lib/builder can't import prisma/ itself
// (eslint purity rule), so its tests come through here.
export function seedPart<S extends Slot>(
  category: S,
  sku: string
): BuildPart<S> {
  const file = seedFiles.find((seed) => seed.category === category)!
  const part = (
    file.parts as readonly { sku: string; name: string; specs: unknown }[]
  ).find((seeded) => seeded.sku === sku)
  if (!part) throw new Error(`no ${category} with sku ${sku} in the seed`)
  return {
    id: part.sku,
    name: part.name,
    category,
    specs: part.specs as Specs<S>,
  }
}

// A hand-written part for a case the seed can't reach. Name it as a fixture.
export function fixturePart<S extends Slot>(
  category: S,
  id: string,
  specs: Specs<S>
): BuildPart<S> {
  return { id, name: `Fixture ${id}`, category, specs }
}

// A build holding each part once, in its own slot; storage parts are added
// in order
export function buildOf(...parts: AnyBuildPart[]): Build {
  const build: Record<string, { part: AnyBuildPart; quantity: number }[]> = {}
  for (const part of parts) {
    const entries = part.category === "storage" ? (build.storage ?? []) : []
    build[part.category] = [...entries, { part, quantity: 1 }]
  }
  return build as Build
}
