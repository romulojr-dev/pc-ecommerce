// Must stay the first import: loads .env.local before @/lib/env reads it
import "./seed/load-env"

import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { db } from "@/lib/db"
import { env } from "@/lib/env"
import { assertResetAllowed, ResetRefusedError } from "@/lib/reset-guard"
import { builderCategories } from "@/lib/specs"

import { seedFiles } from "./seed/data"
import { shippingSeed } from "./seed/data/shipping"
import { formatErrors } from "./seed/format-errors"
import { findReservedCategorySlugs, validateSeed } from "./seed/validate"
import { validateShippingSeed } from "./seed/validate-shipping"
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

  // Category rows come from the registry, so its slugs are checked here
  const reserved = findReservedCategorySlugs(Object.keys(builderCategories))
  if (reserved.length > 0) {
    console.error(`${reserved.join("\n")}\nNothing was written.`)
    return 1
  }

  // Validate everything before touching the database, so invalid data
  // never truncates anything
  const validation = validateSeed(seedFiles)
  if (!validation.ok) {
    console.error(formatErrors(validation.errors))
    return 1
  }

  const shippingErrors = validateShippingSeed(shippingSeed)
  if (shippingErrors.length > 0) {
    console.error(`${shippingErrors.join("\n")}\nNothing was written.`)
    return 1
  }

  // A reset deletes shared builds too (docs/specs/022-share-build). The
  // production seed is run by hand, so the guard also checks the host.
  if (reset) {
    try {
      assertResetAllowed(
        {
          NODE_ENV: process.env.NODE_ENV,
          VERCEL_ENV: process.env.VERCEL_ENV,
          DATABASE_URL: env.DATABASE_URL,
          PRODUCTION_DATABASE_HOST: env.PRODUCTION_DATABASE_HOST,
        },
        { requireProductionHost: true }
      )
    } catch (error) {
      if (!(error instanceof ResetRefusedError)) throw error
      console.error(error.message)
      return 1
    }
  }

  // Name the target before writing, so a one-off production seed can be
  // checked against the expected host (spec 004, "Seeding production")
  const host = new URL(env.DATABASE_URL).host
  console.log(reset ? `Resetting catalog on ${host}` : `Seeding ${host}`)

  const counts = await writeSeed(db, validation.files, {
    reset,
    shipping: shippingSeed,
  })
  const kept = counts.updated > 0 ? "; stock, price and status kept" : ""
  console.log(
    `Seeded ${counts.categories} categories, ${counts.brands} brands, ${
      counts.created + counts.updated
    } products (${counts.created} created, ${counts.updated} updated${kept}), ${
      counts.images
    } ${counts.images === 1 ? "image" : "images"} added.`
  )
  console.log(
    counts.shippingRates > 0
      ? `Shipping rates: ${counts.shippingRates} added.`
      : "Shipping rates: kept (already set)."
  )
  console.log(
    counts.settingsCreated
      ? "Store settings: created."
      : "Store settings: kept (already set)."
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
