import type { BuildItem } from "./parse"
import type { Slot } from "./types"

// The canonical form of a build's items (docs/specs/022-share-build, Rules ›
// Canonical form): the same set of items in any order gives the same list.
// The server hashes its text to tell whether two shared builds are the same,
// and the browser compares it to see whether a shared build is the one it
// already holds. The form is stored (as a hash), so changing it is a new ADR.

export type CanonicalItem = readonly [
  slot: Slot,
  productId: string,
  quantity: number,
]

// Sorted by slot name, then product id, both as plain strings (UTF-16 code
// units, never a locale). The builder's slot order doesn't enter into it, so
// adding a category can't change a stored hash. Items are expected to be
// valid: a (slot, productId) pair appears once.
export function canonicalItems(items: readonly BuildItem[]): CanonicalItem[] {
  return items
    .map(({ slot, productId, quantity }): CanonicalItem => [
      slot,
      productId,
      quantity,
    ])
    .sort((a, b) => compare(a[0], b[0]) || compare(a[1], b[1]))
}

// The text that is hashed: JSON with no whitespace
export function canonicalText(items: readonly BuildItem[]): string {
  return JSON.stringify(canonicalItems(items))
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
