import Link from "next/link"

import { CartGroup } from "@/components/cart/cart-group"
import { CartLine } from "@/components/cart/cart-line"
import { ProblemsBox } from "@/components/checkout/problems-box"
import { Button, buttonVariants } from "@/components/ui/button"
import { subtotalLabel } from "@/lib/cart/copy"
import {
  addressLines,
  shippingValue,
  STEP_COPY,
  thresholdNote,
} from "@/lib/checkout/copy"
import type { ReviewResult } from "@/lib/checkout/review-checkout"
import { formatPeso } from "@/lib/format"
import { cn, focusRing } from "@/lib/utils"

type Ok = Extract<ReviewResult, { ok: true }>

const noop = () => {}
const PLACE_NOTE_ID = "checkout-place-note"
export const DETAILS_HREF = "/checkout"

function EditLink({ label }: { label: string }) {
  return (
    <Link
      href={DETAILS_HREF}
      aria-label={label}
      className={cn(buttonVariants({ variant: "link", size: "sm" }), focusRing)}
    >
      Edit
    </Link>
  )
}

// The review's content (docs/specs/029-checkout-steps, Behavior 19–23):
// contact, delivery, the cart's lines as they are, and the totals. Place
// order is always disabled in this story. Presentational: ReviewStep owns the
// request and the focus.
export function ReviewView({
  result,
  onCheckAgain,
  checking = false,
}: {
  result: Ok
  onCheckAgain: () => void
  checking?: boolean
}) {
  const { review, contact, address, store } = result
  const warned = new Set(review.warnings.map((w) => w.buildId))
  const { shipping, problems } = review
  const lines = address
    ? addressLines({
        street: address.street,
        zip: address.zip,
        barangay: address.barangay.name,
        city: address.city.name,
        province: address.province.name,
        region: address.region.name,
      })
    : null

  return (
    <div className="flex flex-col gap-6">
      {problems.length > 0 && (
        <ProblemsBox problems={problems} changeDeliveryHref={DETAILS_HREF} />
      )}
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-base font-medium">Contact</h3>
              <EditLink label="Edit contact" />
            </div>
            <p>{contact.name}</p>
            <p>{contact.email}</p>
            <p>{contact.mobile}</p>
          </section>

          <section className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-base font-medium">Delivery</h3>
              <EditLink label="Edit delivery" />
            </div>
            {lines ? (
              <>
                <p>{lines[0]}</p>
                <p>{lines[1]}</p>
              </>
            ) : (
              <>
                <p className="font-medium">Store pickup</p>
                <p className="whitespace-pre-line">{store?.address}</p>
                <p className="whitespace-pre-line text-muted-foreground">
                  {store?.hours}
                </p>
              </>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-base font-medium">Items</h3>
            <ul className="divide-y border-y">
              {review.view.entries.map((entry) =>
                entry.kind === "build" ? (
                  <CartGroup
                    key={entry.buildId}
                    group={entry}
                    readOnly
                    busy={false}
                    message={null}
                    onRemove={noop}
                    defaultExpanded={warned.has(entry.buildId)}
                    issuesLead={
                      warned.has(entry.buildId)
                        ? STEP_COPY.warningsLead
                        : undefined
                    }
                  />
                ) : (
                  <CartLine
                    key={entry.id}
                    line={entry}
                    readOnly
                    busy={false}
                    message={null}
                    onQuantity={noop}
                    onSetTo={noop}
                    onRemove={noop}
                  />
                )
              )}
            </ul>
          </section>
        </div>

        <aside
          aria-label="Order summary"
          className="flex flex-col gap-3 rounded-lg border p-5 text-sm lg:sticky lg:top-6"
        >
          <h2 className="sr-only">Order summary</h2>
          <dl className="flex flex-col gap-2">
            <div className="flex justify-between gap-4">
              <dt>{subtotalLabel(review.view.count)}</dt>
              <dd className="tabular-nums">{formatPeso(review.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Shipping</dt>
              <dd className="tabular-nums">{shippingValue(shipping)}</dd>
            </div>
            {review.total !== null && (
              <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPeso(review.total)}</dd>
              </div>
            )}
          </dl>
          {review.threshold !== null && (
            <p className="text-muted-foreground">
              {thresholdNote(review.threshold)}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="lg"
              disabled
              aria-describedby={problems.length > 0 ? undefined : PLACE_NOTE_ID}
              className="h-10 w-full text-sm"
            >
              {STEP_COPY.placeOrder}
            </Button>
            {problems.length === 0 && (
              <p id={PLACE_NOTE_ID} className="text-muted-foreground">
                {STEP_COPY.placeSoon}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={checking}
              onClick={onCheckAgain}
            >
              {STEP_COPY.checkAgain}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  )
}
