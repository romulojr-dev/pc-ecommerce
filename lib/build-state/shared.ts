import {
  type AnyBuildPart,
  assembleBuild,
  type BuildChange,
  type BuildItem,
  type BuildStatus,
  buildStatus,
  checkBuild,
  estimateWattage,
  type Issue,
  parseBuild,
  type PowerEstimate,
  type Severity,
  SLOTS,
  type Slot,
  toBuildItems,
} from "@/lib/builder"

import type { BuilderPartData } from "./parts"
import { worstSeverity } from "./severity"
import { buildTotal, unavailableParts } from "./summary"

// What the shared page shows and what Open in builder opens (docs/specs/022-
// share-build, Behavior 12–17 and 20–26). Pure: the server builds the view
// from a snapshot read per request, and a client component only gets plain
// data from it.

// One item of a snapshot. `available` parts are active builder parts with
// valid specs and their current price and stock; `retired` ones are
// everything else, and carry only what may be shown: a name and a brand.
export type SharedItem = { slot: Slot; quantity: number } & (
  | { state: "available"; data: BuilderPartData }
  | { state: "retired"; id: string; name: string; brand: string }
)

export type SharedRow =
  | {
      kind: "part"
      quantity: number
      data: BuilderPartData
      severity: Severity | null
    }
  | { kind: "retired"; id: string; name: string; brand: string }

// "incomplete" takes the place of "ok" when a part is no longer sold: the
// checks ran on fewer parts than the sharer chose (Behavior 16, D4, D18)
export type SharedStatus = BuildStatus | "incomplete"

export type SharedBuildView = {
  // Every slot, in builder order; storage lists its drives by name (D7)
  slots: { slot: Slot; rows: SharedRow[] }[]
  // Centavos, of the parts that are still sold
  total: number
  power: PowerEstimate
  status: SharedStatus
  issues: readonly Issue[]
  // At least one part was checked. When false, the page has no issues line.
  checked: boolean
  // The line about parts that can't be bought right now, or null
  availability: string | null
  // Parts no longer sold, and the banner that says so
  retiredCount: number
  banner: string | null
  // For Open in builder
  openPlan: {
    // The items to save: the snapshot's, less the parts that are gone
    items: BuildItem[]
    // All of the snapshot's items, to compare with the saved build
    snapshotItems: BuildItem[]
    // What was left out, for the "shared build" notice
    changes: BuildChange[]
  }
}

// The not-buyable line (the builder's own line, minus its "add to cart"
// advice: this page has no cart button)
export function sharedAvailabilityMessage(
  names: readonly string[]
): string | null {
  if (names.length === 0) return null
  if (names.length === 1) {
    return `The ${names[0]} isn't available to buy right now.`
  }
  return `${names.length} parts in this build aren't available to buy right now.`
}

// The banner above the slots when parts are no longer sold
export function retiredBanner(count: number): string | null {
  if (count === 0) return null
  return count === 1
    ? "1 part is no longer sold, so the total and checks leave it out."
    : `${count} parts are no longer sold, so the total and checks leave them out.`
}

type Part = {
  kind: "part"
  slot: Slot
  quantity: number
  data: BuilderPartData
}
type Retired = {
  kind: "retired"
  slot: Slot
  quantity: number
  id: string
  name: string
  brand: string
}

// A part counts as available only in its own slot: one found in another
// category's slot is as good as gone (assembleBuild drops it too)
function classify(item: SharedItem): Part | Retired {
  const { slot, quantity } = item
  if (item.state === "available") {
    if (item.data.part.category === slot) {
      return { kind: "part", slot, quantity, data: item.data }
    }
    return {
      kind: "retired",
      slot,
      quantity,
      id: item.data.part.id,
      name: item.data.part.name,
      brand: item.data.brand,
    }
  }
  return {
    kind: "retired",
    slot,
    quantity,
    id: item.id,
    name: item.name,
    brand: item.brand,
  }
}

const idOf = (entry: Part | Retired) =>
  entry.kind === "part" ? entry.data.part.id : entry.id
const nameOf = (entry: Part | Retired) =>
  entry.kind === "part" ? entry.data.part.name : entry.name

// Slot order; drives by name, A to Z (the snapshot keeps no order, D7)
function inOrder(entries: (Part | Retired)[]): (Part | Retired)[] {
  const slotIndex = (slot: Slot) => SLOTS.indexOf(slot)
  return [...entries].sort(
    (a, b) =>
      slotIndex(a.slot) - slotIndex(b.slot) ||
      nameOf(a).localeCompare(nameOf(b), "en") ||
      (idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0)
  )
}

const toItem = (entry: Part | Retired): BuildItem => ({
  slot: entry.slot,
  productId: idOf(entry),
  quantity: entry.quantity,
})

// Snapshots are validated when they are written, so the items are trusted
// to respect the slot limits here
export function sharedBuildView(items: readonly SharedItem[]): SharedBuildView {
  const entries = inOrder(items.map(classify))
  const parts = entries.filter((entry): entry is Part => entry.kind === "part")

  const loaded = new Map(parts.map((part) => [part.data.part.id, part.data]))
  const partMap = new Map<string, AnyBuildPart>(
    parts.map((part) => [part.data.part.id, part.data.part])
  )
  const { build } = assembleBuild(parts.map(toItem), partMap)

  const issues = checkBuild(build)
  const retiredCount = entries.length - parts.length
  const checkedStatus = buildStatus(issues)

  const snapshotItems = entries.map(toItem)
  const parsed = parseBuild(snapshotItems)
  const assembled = assembleBuild(parsed.items, partMap)

  return {
    slots: SLOTS.map((slot) => ({
      slot,
      rows: entries
        .filter((entry) => entry.slot === slot)
        .map((entry): SharedRow =>
          entry.kind === "part"
            ? {
                kind: "part",
                quantity: entry.quantity,
                data: entry.data,
                severity: worstSeverity(issues, slot, entry.data.part.id),
              }
            : {
                kind: "retired",
                id: entry.id,
                name: entry.name,
                brand: entry.brand,
              }
        ),
    })),
    total: buildTotal(build, loaded),
    power: estimateWattage(build),
    status:
      retiredCount > 0 && checkedStatus === "ok" ? "incomplete" : checkedStatus,
    issues,
    checked: parts.length > 0,
    availability: sharedAvailabilityMessage(unavailableParts(build, loaded)),
    retiredCount,
    banner: retiredBanner(retiredCount),
    openPlan: {
      items: toBuildItems(assembled.build),
      snapshotItems,
      changes: [...parsed.changes, ...assembled.changes],
    },
  }
}
