import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { Container } from "@/components/layout/container"
import { OrderView } from "@/components/orders/order-view"
import { credentialFromParams } from "@/lib/orders/credential"
import { orderTitle } from "@/lib/orders/copy"
import { loadOrder } from "@/lib/orders/get-order"
import { sweepAfterResponse } from "@/lib/orders/release"
import { gateway } from "@/lib/payments/gateway"
import { parsePaymentParam, paymentView } from "@/lib/payments/payment-view"

// A shopper's own order, found by its number and opened with a secret key in
// the link (docs/specs/030-place-an-order, Behavior 16–19; ADR 0009). Not
// indexed and kept out of the sitemap. No canonical and no social tags: the
// only URL that works carries the key, so a canonical with it would write the
// secret into the markup and one without it would point at a 404 (D6).
//
// The credential is the key, or a signed link's `sig`, `exp` and `p`
// (docs/specs/035-email-foundation-signed-links); each is a single query
// value, and anything else is a bad link.
type Query = Awaited<PageProps<"/orders/[number]">["searchParams"]>
const credentialOf = ({ key, sig, exp, p }: Query) =>
  credentialFromParams({ key, sig, exp, p })

// A bad link is a 404 here too, so the page and its metadata agree. The read
// is shared with the page (React cache).
export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/orders/[number]">): Promise<Metadata> {
  const { number } = await params
  if (!(await loadOrder(number, credentialOf(await searchParams)))) notFound()

  return {
    title: orderTitle(number),
    description: "Your PC Silicon order.",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  }
}

// Per request, with no route-level loading state: a skeleton would stream a
// 200 before notFound() could answer 404 (spec 022 D14). A wrong key, a
// missing key and an unknown number are the same 404.
export default async function OrderPage({
  params,
  searchParams,
}: PageProps<"/orders/[number]">) {
  await connection()

  const { number } = await params
  const query = await searchParams
  const { payment } = query
  const order = await loadOrder(number, credentialOf(query))
  if (!order) notFound()
  // Expired orders, this one included, are released after the response
  // (docs/specs/033-release-unpaid-orders); the page already shows a past-due
  // order as cancelled
  const now = new Date()
  sweepAfterResponse(now)

  // What the payment area shows (docs/specs/031-pay-with-xendit, Behavior
  // 4–12): `payment=` only chooses the view, and never changes data
  const { testInstructions, name } = gateway()
  const view = paymentView(
    order.status,
    order.expiresAt,
    parsePaymentParam(payment),
    now,
    order.payments
  )

  return (
    <Container className="py-8">
      <OrderView
        order={order}
        payment={{ view, instructions: testInstructions, gatewayName: name }}
      />
    </Container>
  )
}
