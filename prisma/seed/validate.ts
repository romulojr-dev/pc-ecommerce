import { slugify } from "@/lib/slug"
import type { BuilderCategorySlug } from "@/lib/specs"

import { describeIssue, type SeedError } from "./format-errors"
import { seedPartSchema, type ValidSeedPart } from "./part-schema"

export type SeedFile = {
  file: string
  category: BuilderCategorySlug
  parts: readonly unknown[]
}

export type ValidPart = ValidSeedPart<BuilderCategorySlug> & {
  brandSlug: string
}

export type ValidSeedFile = {
  file: string
  category: BuilderCategorySlug
  parts: ValidPart[]
}

export type SeedValidation =
  { ok: true; files: ValidSeedFile[] } | { ok: false; errors: SeedError[] }

// Checks every part of every file and collects all errors. Pure: no
// database or env access, so it can be tested with plain fixtures.
export function validateSeed(files: readonly SeedFile[]): SeedValidation {
  const errors: SeedError[] = []
  const valid: ValidSeedFile[] = []
  // Valid parts with their original position, for the duplicate checks
  const placed: Placed[] = []

  for (const { file, category, parts } of files) {
    const schema = seedPartSchema(category)
    const validParts: ValidPart[] = []

    parts.forEach((raw, index) => {
      const where = { file, index, ...identify(raw) }
      // reportInput keeps the bad value on each issue, which tells a
      // missing field ("required") apart from a wrong one
      const result = schema.safeParse(raw, { reportInput: true })
      if (!result.success) {
        for (const issue of result.error.issues) {
          for (const problem of describeIssue(issue)) {
            errors.push({ ...where, ...problem })
          }
        }
        return
      }

      const part = result.data
      if (part.slug === "") {
        errors.push({
          ...where,
          path: ["name"],
          message: "must contain a letter or digit (needed for the slug)",
        })
        return
      }
      const validPart = { ...part, brandSlug: slugify(part.brand) }
      validParts.push(validPart)
      placed.push({ file, index, part: validPart })
    })

    valid.push({ file, category, parts: validParts })
  }

  errors.push(
    ...findDuplicates(placed, "sku"),
    ...findDuplicates(placed, "slug")
  )
  // Report in file order, then part order (stable, so a part's own errors
  // keep their order)
  const fileOrder = new Map(files.map(({ file }, i) => [file, i]))
  errors.sort(
    (a, b) =>
      (fileOrder.get(a.file) ?? 0) - (fileOrder.get(b.file) ?? 0) ||
      a.index - b.index
  )
  return errors.length > 0 ? { ok: false, errors } : { ok: true, files: valid }
}

function identify(raw: unknown): { name?: string; sku?: string } {
  if (typeof raw !== "object" || raw === null) return {}
  const { name, sku } = raw as Record<string, unknown>
  return {
    name: typeof name === "string" ? name : undefined,
    sku: typeof sku === "string" ? sku : undefined,
  }
}

type Placed = { file: string; index: number; part: ValidPart }

// SKU and slug must be unique across all files. Every occurrence is
// reported, naming the other locations.
function findDuplicates(placed: Placed[], field: "sku" | "slug"): SeedError[] {
  const seen = new Map<string, Placed[]>()
  for (const place of placed) {
    const value = place.part[field]
    seen.set(value, [...(seen.get(value) ?? []), place])
  }

  const errors: SeedError[] = []
  for (const [value, places] of seen) {
    if (places.length < 2) continue
    for (const place of places) {
      const others = places
        .filter((other) => other !== place)
        .map((other) => `${other.file} #${other.index + 1}`)
        .join(", ")
      errors.push({
        file: place.file,
        index: place.index,
        name: place.part.name,
        sku: place.part.sku,
        path: [field],
        message: `"${value}" is also used by ${others}`,
      })
    }
  }
  return errors
}
