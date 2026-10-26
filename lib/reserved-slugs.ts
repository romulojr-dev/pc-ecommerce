// Top-level route names. Category pages live at /<category-slug> (PRD:
// /gpu/rtx-5070-12gb), so a category may not take one of these. Add a name
// here before adding a top-level route; reserved-slugs.test.ts checks app/.
export const RESERVED_SLUGS = [
  // Planned routes
  "cart",
  "builder",
  "account",
  "admin",
  "checkout",
  "search",
  "api",
  // Current routes
  "products",
  "login",
  "signup",
  "sidebar",
  // Likely routes, reserved early
  "build",
  "builds",
  "orders",
  "brands",
  "deals",
  "compare",
  "wishlist",
  "auth",
  "logout",
  "about",
  "contact",
  "help",
] as const

const reserved: ReadonlySet<string> = new Set(RESERVED_SLUGS)

// Exact match: "cart" is reserved, "cart-accessories" is not
export function isReservedSlug(slug: string): boolean {
  return reserved.has(slug)
}
