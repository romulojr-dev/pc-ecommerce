import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

import { readSheet } from "read-excel-file/node"

import { independentCityProvinces } from "../lib/psgc/independent-cities"
import { PSGC_VERSION } from "../lib/psgc/version"
import {
  PsgcConvertError,
  type Row,
  codeFromCell,
  toFiles,
  transformPsgc,
} from "./psgc/transform"

// `pnpm psgc:convert [workbook]`: converts the PSA's PSGC workbook into the
// address files in data/psgc/json/{version}/ (docs/specs/028-shipping-data-
// and-fee-rules). The output is committed; run this only for a new quarter or
// a change to the rules. The workbook must be named {version}.xlsx, and
// lib/psgc/version.ts must already say that version.

const root = fileURLToPath(new URL("..", import.meta.url))

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

// "30 September 2026" → "2026-09-30"
function isoDate(text: string): string {
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(text.trim())
  const month = match ? MONTHS.indexOf(match[2]) : -1
  if (!match || month < 0) {
    throw new PsgcConvertError(
      `Metadata: can't read the publication date "${text}"`
    )
  }
  return new Date(Date.UTC(Number(match[3]), month, Number(match[1])))
    .toISOString()
    .slice(0, 10)
}

async function main() {
  const workbook = path.resolve(
    root,
    process.argv[2] ?? `data/psgc/${PSGC_VERSION}.xlsx`
  )
  const version = path.basename(workbook, ".xlsx")
  if (version !== PSGC_VERSION) {
    throw new PsgcConvertError(
      `the workbook is ${path.basename(workbook)} but lib/psgc/version.ts says ${PSGC_VERSION}; change the version first`
    )
  }

  const metadata = await readSheet(workbook, "Metadata")
  const published = metadata.find((row) => row[0] === "Publication date:")
  if (typeof published?.[1] !== "string") {
    throw new PsgcConvertError("Metadata: no publication date")
  }

  const sheet = await readSheet(workbook, "PSGC")
  const rows: Row[] = []
  const notes: string[] = []
  let numericCodes = 0
  for (const cells of sheet.slice(1)) {
    const [, rawCode, name, , level] = cells
    if (rawCode === null || rawCode === undefined || rawCode === "") continue
    const code = codeFromCell(rawCode)
    // The PSA's footnotes sit in the code column
    if (code === null) {
      notes.push(String(rawCode).slice(0, 40))
      continue
    }
    if (typeof rawCode === "number") numericCodes++
    if (typeof name !== "string") {
      throw new PsgcConvertError(`row ${code}: no name`)
    }
    rows.push({ code, name, level: typeof level === "string" ? level : null })
  }

  const dataset = transformPsgc(rows, {
    version,
    publishedOn: isoDate(published[1]),
    source: path.basename(workbook),
    independentCityProvinces,
  })

  const folder = path.join(root, "data", "psgc", "json", version)
  rmSync(folder, { recursive: true, force: true })
  const files = toFiles(dataset)
  let largest = { file: "", raw: 0, gzip: 0 }
  for (const [relative, text] of Object.entries(files)) {
    const target = path.join(folder, relative)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, text)
    const raw = Buffer.byteLength(text)
    if (raw > largest.raw) {
      largest = { file: relative, raw, gzip: gzipSync(text).length }
    }
  }

  const { counts } = dataset.manifest
  console.log(
    `PSGC ${version}: wrote ${counts.regions} regions, ${counts.provinces} provinces, ${counts.cities} cities and municipalities, ${counts.barangays} barangays to ${path.relative(root, folder)}.`
  )
  console.log(
    `Largest file: ${largest.file}, ${largest.raw} bytes (${largest.gzip} gzipped).`
  )
  console.log(`Read ${numericCodes} codes stored as numbers.`)
  for (const note of notes) console.log(`Skipped note: ${note}…`)
  console.log(`Trimmed spaces from ${dataset.trimmed} names.`)
  for (const { from, to } of dataset.cleaned) {
    console.log(`Cleaned: ${from} → ${to}`)
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof PsgcConvertError ? `PSGC: ${error.message}.` : error
  )
  process.exitCode = 1
})
