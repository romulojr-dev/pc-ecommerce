import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"

import { CheckoutFlow } from "@/components/checkout/checkout-flow"
import { Container } from "@/components/layout/container"
import { getCartView } from "@/lib/cart/cart"
import { readCartId } from "@/lib/cart/cookie"
import { cartProblems } from "@/lib/checkout/problems"
import { socialMetadata } from "@/lib/seo/metadata"
import { getShippingConfig } from "@/lib/shipping/config"

const title = "Checkout"
const description = "Check out your PC Silicon order."

// A shopper's own order, so not indexed, and kept out of the sitemap
// (docs/specs/029-checkout-steps, Behavior 4)
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/checkout" },
  robots: { index: false },
  ...socialMetadata({ title, description, path: "/checkout" }),
}

// Per request: the cart, its stock and the store's settings change at runtime
// (ADR 0003). No loading.tsx, so the empty-cart redirect stays an HTTP
// redirect (D6). The step and the shopper's details are the browser's: only
// it can read its sessionStorage, so this renders the same shell for both
// steps.
export default async function CheckoutPage() {
  await connection()

  const view = await getCartView(await readCartId())
  if (view.entries.length === 0) redirect("/cart")
  const { settings } = await getShippingConfig()

  return (
    <Container className="py-8">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Checkout
      </h1>
      <div className="mt-6">
        <CheckoutFlow
          pickupEnabled={settings.pickupEnabled}
          store={{ address: settings.storeAddress, hours: settings.storeHours }}
          problems={cartProblems(view)}
          summary={{ count: view.count, subtotal: view.subtotal }}
        />
      </div>
    </Container>
  )
}
