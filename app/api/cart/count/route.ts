import { getCartCount } from "@/lib/cart/cart"
import { readCartId } from "@/lib/cart/cookie"

// The header's cart count, fresh on every request (docs/specs/025-cart-
// single-items, Behavior 13; ADR 0003). Reading the cookie makes it dynamic;
// no-store keeps CDNs and browsers from keeping a copy. It never sets a
// cookie, and with no cart it answers 0 without a database query.
const headers = { "Cache-Control": "no-store" }

export async function GET() {
  const cartId = await readCartId()
  const count = cartId ? await getCartCount(cartId) : 0
  return Response.json({ count }, { headers })
}
