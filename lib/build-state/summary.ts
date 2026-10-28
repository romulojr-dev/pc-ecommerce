import {
  type Build,
  type BuildChange,
  type BuildEntry,
  SLOTS,
} from "@/lib/builder"
import { isBuyable } from "@/lib/stock"

import type { BuilderPartData } from "./parts"
import { SLOT_COPY } from "./slots"

// The builder summary's figures and the page's notices (docs/specs/020-
// builder-page, Behavior 6 and 15, Messages)

type Loaded = ReadonlyMap<string, BuilderPartData>

// Every entry, in slot order
const entries = (build: Build): BuildEntry[] =>
  SLOTS.flatMap((slot): BuildEntry[] => build[slot] ?? [])

// The price the shopper pays for the whole build, in centavos: every
// entry's effectivePrice × quantity. Parts that aren't buyable still count.
export function buildTotal(build: Build, parts: Loaded): number {
  return entries(build).reduce(
    (total, { part, quantity }) =>
      total + (parts.get(part.id)?.effectivePrice ?? 0) * quantity,
    0
  )
}

// The names of the parts that can't be bought now, in slot order
export function unavailableParts(build: Build, parts: Loaded): string[] {
  return entries(build)
    .filter(({ part }) => {
      const data = parts.get(part.id)
      return data !== undefined && !isBuyable(data.stockStatus)
    })
    .map(({ part }) => part.name)
}

// The summary's line about parts that aren't buyable, or null when there
// are none. Counted by product, not unit.
export function availabilityMessage(names: readonly string[]): string | null {
  if (names.length === 0) return null
  if (names.length === 1) {
    return `The ${names[0]} isn't available to buy right now. Replace it to add this build to cart.`
  }
  return `${names.length} parts in this build aren't available to buy right now. Replace them to add this build to cart.`
}

// What the notice says about these changes, one line each. Only a reset and
// parts that are gone are worth telling; the other repairs come from
// hand-edited data (D5).
export function buildNotice(changes: readonly BuildChange[]): string[] {
  const lines: string[] = []
  if (changes.some((change) => change.kind === "reset")) {
    lines.push("We couldn't read your saved build, so we started a new one.")
  }
  const removed = changes.filter(
    (change) => change.kind === "not-found" || change.kind === "wrong-category"
  )
  if (removed.length > 0) {
    const slots = SLOTS.filter((slot) =>
      removed.some((change) => change.slot === slot)
    ).map((slot) => SLOT_COPY[slot].name)
    lines.push(
      removed.length === 1
        ? `A part in your saved build is no longer available, so we removed it: ${slots[0]}.`
        : `Some parts in your saved build are no longer available, so we removed them: ${slots.join(", ")}.`
    )
  }
  return lines
}
