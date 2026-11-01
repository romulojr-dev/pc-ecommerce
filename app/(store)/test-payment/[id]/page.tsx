import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { Container } from "@/components/layout/container"
import { FakePayButtons } from "@/components/payments/fake-pay-buttons"
import { formatPeso } from "@/lib/format"
import { PAY_COPY } from "@/lib/payments/copy"
import { openFakePage } from "@/lib/payments/fake-page"

// The fake gateway's payment page (docs/specs/031-pay-with-xendit, Behavior
// 15–16, D7–D9): it stands in for Xendit's hosted page in CI, E2E and
// previews, and is labelled so nobody mistakes it for a real one. Opened with
// the order's key, like the order page, so it shares that page's headers
// (no-store, no-referrer; next.config.ts), has no canonical and isn't
// indexed. Every miss is the same 404, and the page doesn't exist at all
// unless PAYMENT_GATEWAY is fake.

export const metadata: Metadata = {
  title: PAY_COPY.fakeTitle,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function TestPaymentPage({
  params,
  searchParams,
}: PageProps<"/test-payment/[id]">) {
  await connection()

  const { id } = await params
  const { key } = await searchParams
  const page = await openFakePage(id, typeof key === "string" ? key : null)
  if (!page) notFound()
  const { session, orderNumber, orderHref } = page

  return (
    <Container className="max-w-xl py-12">
      <div className="flex flex-col gap-6 rounded-lg border border-dashed border-amber-500 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {PAY_COPY.fakeHeading}
          </h1>
          <p className="text-sm text-muted-foreground">{PAY_COPY.fakeNote}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Order</dt>
          <dd>{orderNumber}</dd>
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="tabular-nums">
            {session.amountCentavos === null
              ? "—"
              : formatPeso(session.amountCentavos)}
          </dd>
        </dl>
        {session.status === "active" ? (
          <FakePayButtons sessionId={session.id} />
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            <p>{PAY_COPY.fakeClosed}</p>
            <Link href={orderHref} className="underline underline-offset-4">
              {PAY_COPY.backToOrder}
            </Link>
          </div>
        )}
      </div>
    </Container>
  )
}
