import Link from "next/link"

import { CartGroup } from "@/components/cart/cart-group"
import { CartLine } from "@/components/cart/cart-line"
import { ProblemsBox } from "@/components/checkout/problems-box"
import {
  idleVoucherBox,
  VoucherBox,
  type VoucherBoxState,
} from "@/components/checkout/voucher-box"
import { Button, buttonVariants } from "@/components/ui/button"
import { subtotalLabel } from "@/lib/cart/copy"
import type { ReviewActionResult } from "@/app/(store)/checkout/actions"
import {
  addressLines,
  holdText,
  shippingValue,
  STEP_COPY,
  thresholdNote,
} from "@/lib/checkout/copy"
import { formatPeso } from "@/lib/format"
import { discountLabel } from "@/lib/orders/copy"
import { cn, focusRing } from "@/lib/utils"

export type ReviewOk = Extract<ReviewActionResult, { ok: true }>

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
// order works when the server says placing is on and nothing blocks the order
// (docs/specs/030-place-an-order, Behavior 1); otherwise it is disabled.
// Presentational: ReviewStep owns the requests and the focus.
export function ReviewView({
  result,
  placing = false,
  onPlace = noop,
  onCheckAgain,
  voucher = idleVoucherBox,
}: {
  result: ReviewOk
  placing?: boolean
  onPlace?: () => void
  onCheckAgain: () => void
  // The voucher box's text, requests and message (spec 037); ReviewStep owns it
  voucher?: VoucherBoxState
}) {
  const { review, contact, address, store } = result
  const warned = new Set(review.warnings.map((w) => w.buildId))
  const { shipping, problems } = review
  // The line under Place order: why it can't be used, or what placing does
  const placeNote =
    problems.length > 0
      ? null
      : result.ordersEnabled
        ? holdText(result.holdHours)
        : STEP_COPY.placeSoon
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
          <VoucherBox
            applied={
              review.voucher.kind === "applied" ? review.voucher.code : null
            }
            disabled={placing}
            state={voucher}
          />
          <dl className="flex flex-col gap-2 border-t pt-3">
            <div className="flex justify-between gap-4">
              <dt>{subtotalLabel(review.view.count)}</dt>
              <dd className="tabular-nums">{formatPeso(review.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Shipping</dt>
              <dd className="tabular-nums">{shippingValue(shipping)}</dd>
            </div>
            {review.voucher.kind === "applied" && review.discount > 0 && (
              <div className="flex justify-between gap-4">
                <dt>{discountLabel(review.voucher.code)}</dt>
                <dd className="tabular-nums">−{formatPeso(review.discount)}</dd>
              </div>
            )}
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
              disabled={
                !result.ordersEnabled ||
                !review.canPlace ||
                placing ||
                voucher.busy !== null
              }
              aria-busy={placing}
              aria-describedby={placeNote ? PLACE_NOTE_ID : undefined}
              onClick={onPlace}
              className="h-10 w-full text-sm"
            >
              {placing ? STEP_COPY.placing : STEP_COPY.placeOrder}
            </Button>
            {placeNote && (
              <p id={PLACE_NOTE_ID} className="text-muted-foreground">
                {placeNote}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={placing || voucher.busy !== null}
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
