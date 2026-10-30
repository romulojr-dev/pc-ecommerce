// The cart count (docs/specs/025-cart-single-items, Behavior 12, D7): the
// units of single items plus 1 per build group. A build is one thing in the
// cart however many parts it has. One function feeds the header, the count
// route, the action results and the cart summary, so they always agree.
type CountLine = { quantity: number; buildId: string | null }

export function cartCount(lines: readonly CountLine[]): number {
  let units = 0
  const groups = new Set<string>()
  for (const { quantity, buildId } of lines) {
    if (buildId === null) units += quantity
    else groups.add(buildId)
  }
  return units + groups.size
}

// The header link's accessible name
export function cartCountLabel(count: number): string {
  if (count <= 0) return "Cart"
  return `Cart, ${count} ${count === 1 ? "item" : "items"}`
}

// The badge text, or null for no badge
export function badgeText(count: number | null): string | null {
  if (count === null || count <= 0) return null
  return count > 99 ? "99+" : String(count)
}
