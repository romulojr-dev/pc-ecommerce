import {
  type Build,
  checkBuild,
  checkCandidate,
  type Issue,
  SLOT_LIMITS,
  type Slot,
  SLOTS,
  toBuildItems,
} from "@/lib/builder"
import { formatDate } from "@/lib/format"
import { isBuyable } from "@/lib/stock"

import type { BuilderCandidate } from "./candidates"
import { MAX_BUILD_PRODUCTS } from "./parts"
import { planAdd } from "./plan-add"
import { SLOT_COPY } from "./slots"

// The slot picker's list without React (docs/specs/021-slot-picker,
// Behavior 8–17): every candidate checked against the build, grouped,
// sorted, marked, with the action its card offers. The picker re-runs it on
// every change of the build or the toggle; it needs no request.

// In display order (Behavior 8). Errors decide first: a part that doesn't
// fit is "incompatible" whether or not it can be bought (D5).
export type PickerGroup = "fits" | "warnings" | "unbuyable" | "incompatible"

const GROUP_ORDER: Record<PickerGroup, number> = {
  fits: 0,
  warnings: 1,
  unbuyable: 2,
  incompatible: 3,
}

// The groups the default list shows; "Show all" adds the others
const DEFAULT_GROUPS: ReadonlySet<PickerGroup> = new Set(["fits", "warnings"])

export type PickerMarker =
  // The part being changed: no button (Rules › Current part)
  | { kind: "current" }
  // A drive the build holds, other than the one being changed
  | { kind: "in-build"; quantity: number }

export type PickerAction =
  | { kind: "add" }
  // Errors: a confirmation names them first (Behavior 15)
  | { kind: "add-anyway" }
  | { kind: "disabled"; reason: "not-buyable" }
  | { kind: "disabled"; reason: "at-stock"; stock: number }
  | { kind: "disabled"; reason: "full" }
  // The "Current" part
  | { kind: "none" }

export type PickerEntry = {
  candidate: BuilderCandidate
  group: PickerGroup
  buyable: boolean
  // checkCandidate's issues, errors first
  errors: Issue[]
  warnings: Issue[]
  marker: PickerMarker | null
  action: PickerAction
}

// Why the default list is empty (Behavior 17)
export type PickerEmpty = "no-products" | "none-buyable" | "none-fit"

export type PickerOptions = {
  // Storage only: the drive the picker was opened to change. Ignored once
  // it is no longer in the build: the picker then adds a drive (E33).
  replace?: string
  showAll: boolean
}

export type PickerList = {
  // What the picker does now. One-part slots and memory change when the
  // slot holds a part, whatever button opened the picker, so a change made
  // in another tab is respected.
  mode: "add" | "change"
  // Storage, changing: the drive being replaced
  replace: string | null
  // The cards to show, in order
  entries: PickerEntry[]
  // The default list's size, and every active candidate's
  shown: number
  total: number
  // The build's errors that no candidate here fixes (Behavior 16)
  banner: Issue[]
  // Only when the default list is empty
  empty: PickerEmpty | null
  // The other slots named in the candidates' errors, in slot order, for
  // "change your …" (Rules › Empty states). Empty unless `empty` is set.
  changeSlots: Slot[]
  // Memory, changing: the kits the new kit keeps, when 2 or more
  memoryKits: number | null
  // Storage, adding: the build already holds MAX_BUILD_PRODUCTS products
  full: boolean
}

const groupOf = (errors: Issue[], warnings: Issue[], buyable: boolean) =>
  errors.length > 0
    ? "incompatible"
    : !buyable
      ? "unbuyable"
      : warnings.length > 0
        ? "warnings"
        : "fits"

// Group, then the price the shopper pays (cheapest first, D6), then name
// and id, so the order is stable
function compareEntries(a: PickerEntry, b: PickerEntry): number {
  return (
    GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
    a.candidate.data.effectivePrice - b.candidate.data.effectivePrice ||
    a.candidate.data.part.name.localeCompare(b.candidate.data.part.name) ||
    a.candidate.data.part.id.localeCompare(b.candidate.data.part.id)
  )
}

// The build each candidate is judged against: the slot empty, or for
// storage the build without the drive being replaced (as checkCandidate's
// baseline, docs/specs/019-count-capacity-power-rules)
function baseline(build: Build, slot: Slot, replace: string | null): Build {
  if (slot !== "storage") return { ...build, [slot]: [] }
  if (replace === null) return build
  return {
    ...build,
    storage: (build.storage ?? []).filter((entry) => entry.part.id !== replace),
  }
}

export function pickerList(
  build: Build,
  slot: Slot,
  candidates: readonly BuilderCandidate[],
  options: PickerOptions
): PickerList {
  const inSlot = build[slot] ?? []
  const multipleEntries = SLOT_LIMITS[slot].multipleEntries
  const replace =
    multipleEntries &&
    options.replace !== undefined &&
    inSlot.some((entry) => entry.part.id === options.replace)
      ? options.replace
      : null
  const mode = multipleEntries
    ? replace === null
      ? "add"
      : "change"
    : inSlot.length > 0
      ? "change"
      : "add"
  const current = multipleEntries ? replace : (inSlot[0]?.part.id ?? null)
  const items = toBuildItems(build)
  const full =
    multipleEntries &&
    mode === "add" &&
    new Set(items.map((item) => item.productId)).size >= MAX_BUILD_PRODUCTS

  const all = candidates.map((candidate): PickerEntry => {
    const { part, stock, stockStatus } = candidate.data
    const issues = checkCandidate(
      build,
      slot,
      part,
      replace === null ? {} : { replace }
    )
    const errors = issues.filter((issue) => issue.severity === "error")
    const warnings = issues.filter((issue) => issue.severity === "warning")
    const buyable = isBuyable(stockStatus)

    const held = inSlot.find((entry) => entry.part.id === part.id)
    const marker: PickerMarker | null =
      part.id === current
        ? { kind: "current" }
        : multipleEntries && held
          ? { kind: "in-build", quantity: held.quantity }
          : null

    let action: PickerAction
    if (marker?.kind === "current") action = { kind: "none" }
    else if (!buyable) action = { kind: "disabled", reason: "not-buyable" }
    else {
      const plan =
        multipleEntries && mode === "add"
          ? planAdd(items, { slot, productId: part.id, stock })
          : null
      if (plan?.kind === "at-stock") {
        action = { kind: "disabled", reason: "at-stock", stock: plan.stock }
      } else if (plan?.kind === "full") {
        action = { kind: "disabled", reason: "full" }
      } else {
        action = errors.length > 0 ? { kind: "add-anyway" } : { kind: "add" }
      }
    }

    return {
      candidate,
      group: groupOf(errors, warnings, buyable),
      buyable,
      errors,
      warnings,
      marker,
      action,
    }
  })
  all.sort(compareEntries)

  const defaultList = all.filter((entry) => DEFAULT_GROUPS.has(entry.group))
  const empty: PickerEmpty | null =
    all.length === 0
      ? "no-products"
      : defaultList.length > 0
        ? null
        : all.some((entry) => entry.errors.length === 0)
          ? "none-buyable"
          : "none-fit"

  const named = new Set(
    empty === null
      ? []
      : all.flatMap((entry) =>
          entry.errors.flatMap((issue) => issue.parts.map((part) => part.slot))
        )
  )
  const changeSlots = SLOTS.filter(
    (other) => other !== slot && named.has(other)
  )

  const memoryQuantity = slot === "memory" ? (inSlot[0]?.quantity ?? 0) : 0

  return {
    mode,
    replace,
    entries: options.showAll ? all : defaultList,
    shown: defaultList.length,
    total: all.length,
    banner: checkBuild(baseline(build, slot, replace)).filter(
      (issue) => issue.severity === "error"
    ),
    empty,
    changeSlots,
    memoryKits:
      mode === "change" && memoryQuantity >= 2 ? memoryQuantity : null,
    full,
  }
}

// Copy (docs/specs/021-slot-picker, Messages)

// "CPU or memory", "CPU, memory or case"
function orList(words: readonly string[]): string {
  if (words.length <= 1) return words.join("")
  return `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`
}

export function pickerTitle(
  slot: Slot,
  mode: "add" | "change",
  replacedName: string | null
): string {
  const copy = SLOT_COPY[slot]
  if (slot === "storage") {
    return mode === "change" && replacedName
      ? `Replace the ${replacedName}`
      : "Add a drive"
  }
  return mode === "change" ? `Change the ${copy.noun}` : copy.choose
}

export function countLine(slot: Slot, list: PickerList, showAll: boolean) {
  const { plural } = SLOT_COPY[slot]
  return showAll
    ? `Showing all ${list.total} ${plural}.`
    : `${list.shown} of ${list.total} ${plural} fit your build and are in stock.`
}

export const bannerTitle = (slot: Slot) =>
  `Picking a ${SLOT_COPY[slot].item} won't fix this:`

export const memoryNote = (kits: number) =>
  `Your build has ${kits} kits of memory. The kit you pick keeps that quantity, up to its stock.`

export function emptyMessage(slot: Slot, list: PickerList): string | null {
  const { item, plural } = SLOT_COPY[slot]
  const change =
    list.changeSlots.length > 0
      ? `, or change your ${orList(list.changeSlots.map((other) => SLOT_COPY[other].noun))}`
      : ""
  switch (list.empty) {
    case "no-products":
      return `There are no ${plural} in the store right now.`
    case "none-buyable":
      return `No ${item} that fits your build is in stock right now. Turn on "Show all" to see the ones that fit${change}.`
    case "none-fit":
      return `No ${item} fits your build. Turn on "Show all" to see why${change}.`
    default:
      return null
  }
}

// The stock reason on a greyed card, or null for a buyable part
export function stockReason(candidate: BuilderCandidate): string | null {
  const { stockStatus } = candidate.data
  if (stockStatus === "out-of-stock") return "Out of stock"
  if (stockStatus === "pre-order" && candidate.card.preorderShipsOn) {
    return `Pre-order: ships ${formatDate(candidate.card.preorderShipsOn)}`
  }
  return null
}
