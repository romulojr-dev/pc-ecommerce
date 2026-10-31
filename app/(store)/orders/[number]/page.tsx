import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { Container } from "@/components/layout/container"
import { OrderView } from "@/components/orders/order-view"
import { orderTitle } from "@/lib/orders/copy"
import { loadOrder } from "@/lib/orders/get-order"

// A shopper's own order, found by its number and opened with a secret key in
// the link (docs/specs/030-place-an-order, Behavior 16–19; ADR 0009). Not
// indexed and kept out of the sitemap. No canonical and no social tags: the
// only URL that works carries the key, so a canonical with it would write the
// secret into the markup and one without it would point at a 404 (D6).
//
// The key is a single query value; anything else counts as no key.
const keyOf = (value: string | string[] | undefined): string | undefined =>
  typeof value === "string" ? value : undefined

// A bad link is a 404 here too, so the page and its metadata agree. The read
// is shared with the page (React cache).
export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/orders/[number]">): Promise<Metadata> {
  const { number } = await params
  const { key } = await searchParams
  if (!(await loadOrder(number, keyOf(key)))) notFound()

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
  const { key } = await searchParams
  const order = await loadOrder(number, keyOf(key))
  if (!order) notFound()

  return (
    <Container className="py-8">
      <OrderView order={order} now={new Date()} />
    </Container>
  )
}
