import type { Metadata } from "next"
import { connection } from "next/server"

import { CartContent } from "@/components/cart/cart-content"
import { Container } from "@/components/layout/container"
import { getCartView } from "@/lib/cart/cart"
import { readCartId } from "@/lib/cart/cookie"
import { socialMetadata } from "@/lib/seo/metadata"

const title = "Cart"
const description = "Your PC Silicon cart."

// A shopper's own cart, so not indexed, and kept out of the sitemap
// (docs/specs/025-cart-single-items, Behavior 16)
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/cart" },
  robots: { index: false },
  ...socialMetadata({ title, description, path: "/cart" }),
}

// Per request: prices, stock and a product's status change at runtime, and
// the cart is the cookie's (ADR 0003). The lines come back from the server
// after every change (the actions refresh the page).
export default async function CartPage() {
  await connection()

  const view = await getCartView(await readCartId())

  return (
    <Container className="py-8">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Cart
      </h1>
      <div className="mt-6">
        <CartContent view={view} />
      </div>
    </Container>
  )
}
