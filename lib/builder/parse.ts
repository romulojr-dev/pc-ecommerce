import { z } from "zod"

import { SLOT_LIMITS, SLOTS } from "./limits"
import type { AnyBuildPart, Build, BuildEntry, Slot } from "./types"

// Untrusted builds (docs/specs/018-compatibility-rules, "Parsing untrusted
// builds"). Everything read from localStorage, a share link, a saved build
// or a checkout request goes through parseBuild, then assembleBuild once its
// parts are loaded. Bad data is repaired and reported, never thrown.

// The stored and transferred shape: one BuildItem row. No coercion, so "2"
// is not 2.
export const buildItemSchema = z.object({
  slot: z.enum(SLOTS as [Slot, ...Slot[]]),
  productId: z.string().min(1),
  quantity: z.int().min(1),
})
export const buildItemsSchema = z.array(buildItemSchema)

export type BuildItem = z.infer<typeof buildItemSchema>

export type BuildChangeKind =
  | "reset"
  | "invalid-entry"
  | "unknown-slot"
  | "invalid-quantity"
  | "merged-duplicate"
  | "extra-entry"
  | "quantity-set-to-1"
  | "not-found"
  | "wrong-category"

// What parsing changed, for the builder's notice and logs. `detail` is for
// developers; the UI writes its own copy.
export type BuildChange = {
  kind: BuildChangeKind
  slot?: Slot
  productId?: string
  detail: string
}

const slotOrder = (slot: Slot) => SLOTS.indexOf(slot)

// Why an item failed: a bad slot or quantity alone gets its own kind
function invalidItem(raw: unknown, index: number, error: z.ZodError) {
  const fields = new Set(error.issues.map((issue) => issue.path[0]))
  const only = (field: string) => fields.size === 1 && fields.has(field)
  const value = raw as Record<string, unknown>
  if (only("slot") && typeof value.slot === "string") {
    return {
      kind: "unknown-slot",
      detail: `${value.slot} is not a builder slot`,
    } satisfies BuildChange
  }
  if (only("quantity") && typeof value.quantity === "number") {
    const slot = value.slot as Slot
    const productId = value.productId as string
    return {
      kind: "invalid-quantity",
      slot,
      productId,
      detail: `${slot} ${productId}: quantity ${value.quantity} is not a whole number of at least 1`,
    } satisfies BuildChange
  }
  return {
    kind: "invalid-entry",
    detail: `item ${index} is not a valid build item`,
  } satisfies BuildChange
}

// Checks stored items against the schema and the slot limits, repairing
// what it can. Ids only, so the caller knows which parts to load.
export function parseBuild(input: unknown): {
  items: BuildItem[]
  changes: BuildChange[]
} {
  if (input === undefined) return { items: [], changes: [] }
  if (!Array.isArray(input)) {
    return {
      items: [],
      changes: [
        { kind: "reset", detail: "stored build is not a list of items" },
      ],
    }
  }
  const changes: BuildChange[] = []

  // 1. The schema
  let items: BuildItem[] = []
  input.forEach((raw, index) => {
    const result = buildItemSchema.safeParse(raw)
    if (result.success) items.push(result.data)
    else changes.push(invalidItem(raw, index, result.error))
  })

  // 2. Storage lists each drive once: later duplicates merge into the first
  const firstDrive = new Map<string, BuildItem>()
  const merged = new Map<string, number>()
  items = items.flatMap((item) => {
    if (!SLOT_LIMITS[item.slot].multipleEntries) return [item]
    const first = firstDrive.get(item.productId)
    if (!first) {
      const copy = { ...item }
      firstDrive.set(item.productId, copy)
      return [copy]
    }
    first.quantity += item.quantity
    merged.set(item.productId, (merged.get(item.productId) ?? 1) + 1)
    return []
  })
  for (const [productId, count] of merged) {
    changes.push({
      kind: "merged-duplicate",
      slot: "storage",
      productId,
      detail: `storage ${productId}: merged ${count} entries`,
    })
  }

  // 3. Single-entry slots keep their first entry. The store replaces in
  // place, so a second one can only come from corrupted or hand-made data.
  const filled = new Set<Slot>()
  items = items.filter((item) => {
    if (SLOT_LIMITS[item.slot].multipleEntries) return true
    if (!filled.has(item.slot)) {
      filled.add(item.slot)
      return true
    }
    changes.push({
      kind: "extra-entry",
      slot: item.slot,
      productId: item.productId,
      detail: `${item.slot} holds one part; dropped ${item.productId}`,
    })
    return false
  })

  // 4. One-part slots take quantity 1
  items = items.map((item) => {
    if (SLOT_LIMITS[item.slot].quantity === "any" || item.quantity === 1) {
      return item
    }
    changes.push({
      kind: "quantity-set-to-1",
      slot: item.slot,
      productId: item.productId,
      detail: `${item.slot} ${item.productId}: quantity ${item.quantity} set to 1`,
    })
    return { ...item, quantity: 1 }
  })

  // Slot order; a stable sort keeps the drives' order
  items.sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot))
  return { items, changes }
}

// Attaches the loaded parts to parsed items. Ids missing from `parts`
// (deleted, draft, or never existed) and parts in another category's slot
// are dropped and reported.
export function assembleBuild(
  items: readonly BuildItem[],
  parts: ReadonlyMap<string, AnyBuildPart>
): { build: Build; changes: BuildChange[] } {
  const build: Partial<Record<Slot, BuildEntry[]>> = {}
  const changes: BuildChange[] = []
  for (const { slot, productId, quantity } of items) {
    const part = parts.get(productId)
    if (!part) {
      changes.push({
        kind: "not-found",
        slot,
        productId,
        detail: `${slot} ${productId}: part not found`,
      })
    } else if (part.category !== slot) {
      changes.push({
        kind: "wrong-category",
        slot,
        productId,
        detail: `${slot} ${productId}: part is a ${part.category}`,
      })
    } else {
      build[slot] = [...(build[slot] ?? []), { part, quantity }]
    }
  }
  return { build: build as Build, changes }
}

// A build as stored items, in slot order: for saving and sending
export function toBuildItems(build: Build): BuildItem[] {
  return SLOTS.flatMap((slot) =>
    (build[slot] ?? []).map(({ part, quantity }) => ({
      slot,
      productId: part.id,
      quantity,
    }))
  )
}
