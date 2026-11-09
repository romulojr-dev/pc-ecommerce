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
  // Customer sign-in will use these in Phase 2; the sample pages that held
  // them are gone (docs/specs/039-staff-sign-in-admin-shell, D11)
  "login",
  "signup",
  // The fake payment gateway's page (docs/specs/031-pay-with-xendit)
  "test-payment",
  // The fake email transport's page (docs/specs/036-order-emails)
  "dev",
  // The fake photo store's files (docs/specs/049-product-images-upload)
  "test-images",
  // Likely routes, reserved early
  "products",
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
