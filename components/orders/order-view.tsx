import { CopyLink } from "@/components/orders/copy-link"
import { OrderTimeline } from "@/components/orders/order-timeline"
import { SLOT_COPY } from "@/lib/build-state/slots"
import type { Slot } from "@/lib/builder"
import { groupName } from "@/lib/cart/copy"
import { addressLines, shippingValue } from "@/lib/checkout/copy"
import { formatPeso } from "@/lib/format"
import { ORDER_COPY, orderHeading } from "@/lib/orders/copy"
import { isPastDue, payByText, placedOnText } from "@/lib/orders/time"
import { orderTimeline, statusLabel } from "@/lib/orders/timeline"
import {
  type OrderEntry,
  orderEntries,
  type OrderPageData,
  type OrderPageItem,
} from "@/lib/orders/view"

// The order page's content (docs/specs/030-place-an-order, Behavior 18), drawn
// from the order's snapshots and nothing else. A server component: only
// CopyLink needs the browser. `now` is passed in so the past-due text is a
// pure function of the data.

const slotLabel = (slot: string | null): string =>
  slot === null ? "" : (SLOT_COPY[slot as Slot]?.name ?? slot)

function ItemRow({
  item,
  part = false,
}: {
  item: OrderPageItem
  part?: boolean
}) {
  return (
    <li className="flex items-start justify-between gap-4 py-3 text-sm">
      <div className="flex min-w-0 flex-col gap-0.5">
        {part && (
          <span className="text-xs text-muted-foreground">
            {slotLabel(item.slot)}
          </span>
        )}
        <span>{item.name}</span>
        <span className="text-muted-foreground">
          {formatPeso(item.unitPrice)} × {item.quantity}
        </span>
      </div>
      <span className="tabular-nums">
        {formatPeso(item.unitPrice * item.quantity)}
      </span>
    </li>
  )
}

function Entry({ entry }: { entry: OrderEntry }) {
  if (entry.kind === "single") return <ItemRow item={entry.item} />
  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-4 text-sm font-medium">
        <span>{groupName(entry.number)}</span>
        <span className="tabular-nums">{formatPeso(entry.total)}</span>
      </div>
      <ul className="mt-1 divide-y border-l pl-4">
        {entry.parts.map((part, index) => (
          <ItemRow key={index} item={part} part />
        ))}
      </ul>
    </li>
  )
}

export function OrderView({ order, now }: { order: OrderPageData; now: Date }) {
  const timeline = orderTimeline(order)
  const entries = orderEntries(order.items)
  const pending = order.status === "PENDING_PAYMENT"
  const pastDue = pending && isPastDue(order.expiresAt, now)
  const lines = order.address ? addressLines({ ...order.address }) : null

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {orderHeading(order.orderNumber)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {placedOnText(order.createdAt)} · {statusLabel(order.status)}
        </p>
      </header>

      <section aria-labelledby="order-status" className="flex flex-col gap-3">
        <h2 id="order-status" className="sr-only">
          {ORDER_COPY.statusHeading}
        </h2>
        <OrderTimeline timeline={timeline} />
        {pending && (
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium">
              {pastDue ? ORDER_COPY.pastDue : payByText(order.expiresAt)}
            </p>
            {!pastDue && (
              <p className="text-muted-foreground">{ORDER_COPY.payingSoon}</p>
            )}
          </div>
        )}
      </section>

      <CopyLink />

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-8">
          <section
            aria-labelledby="order-items"
            className="flex flex-col gap-2"
          >
            <h2 id="order-items" className="text-base font-medium">
              {ORDER_COPY.itemsHeading}
            </h2>
            <ul className="divide-y border-y">
              {entries.map((entry, index) => (
                <Entry key={index} entry={entry} />
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-1 text-sm">
            <h2 className="text-base font-medium">
              {ORDER_COPY.contactHeading}
            </h2>
            <p>{order.contact.name}</p>
            <p>{order.contact.email}</p>
            <p>{order.contact.mobile}</p>
          </section>

          <section className="flex flex-col gap-1 text-sm">
            {lines ? (
              <>
                <h2 className="text-base font-medium">
                  {ORDER_COPY.addressHeading}
                </h2>
                <p>{lines[0]}</p>
                <p>{lines[1]}</p>
              </>
            ) : (
              <>
                <h2 className="text-base font-medium">
                  {ORDER_COPY.pickupHeading}
                </h2>
                <p className="whitespace-pre-line">{order.store?.address}</p>
                <p className="whitespace-pre-line text-muted-foreground">
                  {order.store?.hours}
                </p>
                <p className="mt-2">{ORDER_COPY.pickupNote}</p>
              </>
            )}
          </section>
        </div>

        <aside
          aria-labelledby="order-summary"
          className="flex flex-col gap-3 rounded-lg border p-5 text-sm lg:sticky lg:top-6"
        >
          <h2 id="order-summary" className="sr-only">
            {ORDER_COPY.summaryHeading}
          </h2>
          <dl className="flex flex-col gap-2">
            <div className="flex justify-between gap-4">
              <dt>{ORDER_COPY.subtotal}</dt>
              <dd className="tabular-nums">{formatPeso(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{ORDER_COPY.shipping}</dt>
              <dd className="tabular-nums">
                {shippingValue({
                  ok: true,
                  fee: order.shippingFee,
                  basis: order.fulfillment === "PICKUP" ? "pickup" : "rate",
                })}
              </dd>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between gap-4">
                <dt>{ORDER_COPY.discount}</dt>
                <dd className="tabular-nums">−{formatPeso(order.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
              <dt>{ORDER_COPY.total}</dt>
              <dd className="tabular-nums">{formatPeso(order.total)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  )
}
