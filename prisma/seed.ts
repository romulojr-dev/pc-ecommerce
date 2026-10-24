// Must stay the first import: loads .env.local before @/lib/env reads it
import "./seed/load-env"

import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { db } from "@/lib/db"
import { env } from "@/lib/env"

import { seedFiles } from "./seed/data"
import { formatErrors } from "./seed/format-errors"
import { validateSeed } from "./seed/validate"
import { SeedWriteError, writeSeed } from "./seed/write"

// pnpm db:seed [--reset]: loads the catalog fixture set into the dev
// database. See docs/specs/001-spec-schemas-and-seed/spec.md.

const USAGE = "Usage: pnpm db:seed [--reset]"

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  const unknown = args.filter((arg) => arg !== "--reset")
  if (unknown.length > 0) {
    console.error(`Unknown option: ${unknown.join(" ")}\n${USAGE}`)
    return 1
  }
  const reset = args.includes("--reset")

  // Error messages name these paths, so they must be right
  const missing = seedFiles.filter(
    ({ file }) =>
      !existsSync(fileURLToPath(new URL(`../${file}`, import.meta.url)))
  )
  if (missing.length > 0) {
    console.error(
      `Seed data files not found (fix prisma/seed/data/index.ts):\n${missing
        .map(({ file }) => `  ${file}`)
        .join("\n")}`
    )
    return 1
  }

  // Validate everything before touching the database, so invalid data
  // never truncates anything
  const validation = validateSeed(seedFiles)
  if (!validation.ok) {
    console.error(formatErrors(validation.errors))
    return 1
  }

  if (reset && process.env.NODE_ENV === "production") {
    console.error("Refusing --reset: NODE_ENV is production.")
    return 1
  }

  // Name the target before writing, so a one-off production seed can be
  // checked against the expected host (spec 004, "Seeding production")
  const host = new URL(env.DATABASE_URL).host
  console.log(reset ? `Resetting catalog on ${host}` : `Seeding ${host}`)

  const counts = await writeSeed(db, validation.files, { reset })
  const kept = counts.updated > 0 ? "; stock, price and status kept" : ""
  console.log(
    `Seeded ${counts.categories} categories, ${counts.brands} brands, ${
      counts.created + counts.updated
    } products (${counts.created} created, ${counts.updated} updated${kept}).`
  )
  return 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    console.error(error instanceof SeedWriteError ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
