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

// Every seed part of a category, e.g. a slot picker's candidates
export function seedParts<S extends Slot>(category: S): BuildPart<S>[] {
  const file = seedFiles.find((seed) => seed.category === category)!
  return (file.parts as readonly { sku: string }[]).map((part) =>
    seedPart(category, part.sku)
  )
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

// The seed parts the builder examples name (spec 001's builds and pairs,
// spec 018's examples)
export const seed = {
  ryzen5_7600: seedPart("cpu", "100-100001015BOX"),
  ryzen7_9800x3d: seedPart("cpu", "100-100001084WOF"),
  ryzen5_5600: seedPart("cpu", "100-100000927BOX"),
  i5_14400f: seedPart("cpu", "BX8071514400F"),
  i5_13400f: seedPart("cpu", "BX8071513400F"),
  i7_14700k: seedPart("cpu", "BX8071514700K"),
  i9_14900k: seedPart("cpu", "BX8071514900K"),
  ultra7_265k: seedPart("cpu", "BX80768265K"),
  ryzen9_9950x: seedPart("cpu", "100-100001277WOF"),
  strixB650a: seedPart("motherboard", "90MB1BP0-M0AAY0"),
  b650iLightning: seedPart("motherboard", "B650I LIGHTNING WIFI"),
  proB760mDdr4: seedPart("motherboard", "PRO B760M-A WIFI DDR4"),
  primeB760m: seedPart("motherboard", "PRIME B760M-A WIFI"),
  x870eAorus: seedPart("motherboard", "X870E AORUS ELITE WIFI7"),
  b550Tomahawk: seedPart("motherboard", "MAG B550 TOMAHAWK"),
  h610m: seedPart("motherboard", "H610M-HDV/M.2 R2.0"),
  vengeanceDdr5: seedPart("memory", "CMK32GX5M2B6000C30"),
  furyDdr4: seedPart("memory", "KF432C16BBK2/16"),
  furyDdr5_1x16: seedPart("memory", "KF556C40BB-16"),
  vengeanceDdr5_4x16: seedPart("memory", "CMK64GX5M4B6000C36"),
  vengeanceDdr5_96: seedPart("memory", "CMK96GX5M2B6400C32"),
  lpxDdr4_64: seedPart("memory", "CMK64GX4M2E3200C16"),
  pro990: seedPart("storage", "MZ-V9P1T0BW"),
  sn850x: seedPart("storage", "WDS200T2X0E"),
  mx500: seedPart("storage", "CT1000MX500SSD1"),
  nv3: seedPart("storage", "SNV3S/1000G"),
  sn770m: seedPart("storage", "WDS100T3X0G"),
  barracuda2tb: seedPart("storage", "ST2000DM008"),
  rtx4060: seedPart("gpu", "DUAL-RTX4060-O8G"),
  rtx5070Sff: seedPart("gpu", "GV-N5070WF3OC-12GD"),
  rtx5090Astral: seedPart("gpu", "ROG-ASTRAL-RTX5090-O32G-GAMING"),
  rx9070xtNitro: seedPart("gpu", "11348-01-20G"),
  rtx3060: seedPart("gpu", "DUAL-RTX3060-O12G-V2"),
  rtx5070Prime: seedPart("gpu", "PRIME-RTX5070-O12G"),
  rtx5080Trio: seedPart("gpu", "GeForce RTX 5080 16G GAMING TRIO OC"),
  lancool216: seedPart("case", "LAN216X"),
  q300l: seedPart("case", "MCB-Q300L-KANN-S00"),
  ridge: seedPart("case", "FD-C-RID1N-11"),
  airflow4000d: seedPart("case", "CC-9011200-WW"),
  nr200p: seedPart("case", "MCB-NR200P-KGNN-S00"),
  a3Matx: seedPart("case", "A3-mATX BLACK"),
  mwe550: seedPart("psu", "MPE-5501-ACAAB"),
  rm850e: seedPart("psu", "CP-9020263-NA"),
  sf750: seedPart("psu", "CP-9020186-NA"),
  sf850l: seedPart("psu", "CP-9020245-NA"),
  a650bn: seedPart("psu", "MAG A650BN"),
  gx1000: seedPart("psu", "SSR-1000FX3"),
  rm1200x: seedPart("psu", "CP-9020254-NA"),
  peerless: seedPart("cpu-cooler", "PA120 SE"),
  nhL9aAm5: seedPart("cpu-cooler", "NH-L9a-AM5"),
  nhL9i17xx: seedPart("cpu-cooler", "NH-L9i-17xx"),
  se224xt: seedPart("cpu-cooler", "SE-224-XT ARGB V3"),
  ak620: seedPart("cpu-cooler", "R-AK620-BKNNMT-G"),
  lf3_360: seedPart("cpu-cooler", "ACFRE00136A"),
  lf3_280: seedPart("cpu-cooler", "ACFRE00135A"),
  kraken240: seedPart("cpu-cooler", "RL-KN240-B1"),
}

// Spec 001's compatible builds
export const buildA = () =>
  buildOf(
    seed.ryzen5_7600,
    seed.strixB650a,
    seed.vengeanceDdr5,
    seed.pro990,
    seed.rtx4060,
    seed.lancool216,
    seed.mwe550,
    seed.peerless
  )
export const buildB = () =>
  buildOf(
    seed.i5_14400f,
    seed.proB760mDdr4,
    seed.furyDdr4,
    seed.mx500,
    seed.rtx5070Sff,
    seed.q300l,
    seed.rm850e,
    seed.peerless
  )
export const buildC = () =>
  buildOf(
    seed.ryzen5_7600,
    seed.b650iLightning,
    seed.vengeanceDdr5,
    seed.sn850x,
    seed.rtx5070Sff,
    seed.ridge,
    seed.sf750,
    seed.nhL9aAm5
  )

// A build with some parts swapped: each replaces the part in its slot
export function swap(build: Build, ...parts: AnyBuildPart[]): Build {
  return { ...build, ...buildOf(...parts) }
}

// Spec values with units use a non-breaking space ("358 mm"), like the spec
// table; write plain spaces in expected messages and pass them through this
export const nbsp = (text: string) => text.replace(/ (mm)\b/g, " $1")

// One formatted value with its unit ("958 W", "1,076 W"), with the
// non-breaking space specValue puts before the unit. For messages that also
// hold product names, where nbsp() would change spaces inside the names.
export const nb = (value: string) => value.replace(/ (\S+)$/, " $1")
