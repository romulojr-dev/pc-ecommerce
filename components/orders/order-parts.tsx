import { SLOT_COPY } from "@/lib/build-state/slots"
import type { Slot } from "@/lib/builder"
import { groupName } from "@/lib/cart/copy"
import { shippingValue } from "@/lib/checkout/copy"
import { formatPeso } from "@/lib/format"
import { discountLabel, ORDER_COPY } from "@/lib/orders/copy"
import type { FulfillmentName } from "@/lib/orders/timeline"
import {
  type OrderEntry,
  orderEntries,
  type OrderPageItem,
} from "@/lib/orders/view"

// The pieces the order page and the cash order's confirmation page share
// (docs/specs/030-place-an-order, Behavior 18; docs/specs/038-cash-on-
// delivery): the items as the cart showed them, and the totals rows. Drawn
// from an order's snapshots and nothing else.

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

// The order's lines, a single line staying a line and a build's parts
// gathered where its first part was
export function OrderItemsList({ items }: { items: readonly OrderPageItem[] }) {
  return (
    <ul className="divide-y border-y">
      {orderEntries(items).map((entry, index) => (
        <Entry key={index} entry={entry} />
      ))}
    </ul>
  )
}

// Subtotal, Shipping, Discount (when there is one) and Total
export function OrderTotalsRows({
  subtotal,
  shippingFee,
  fulfillment,
  discount,
  voucherCode,
  total,
}: {
  subtotal: number
  shippingFee: number
  fulfillment: FulfillmentName
  discount: number
  voucherCode: string | null
  total: number
}) {
  return (
    <dl className="flex flex-col gap-2">
      <div className="flex justify-between gap-4">
        <dt>{ORDER_COPY.subtotal}</dt>
        <dd className="tabular-nums">{formatPeso(subtotal)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt>{ORDER_COPY.shipping}</dt>
        <dd className="tabular-nums">
          {shippingValue({
            ok: true,
            fee: shippingFee,
            basis: fulfillment === "PICKUP" ? "pickup" : "rate",
          })}
        </dd>
      </div>
      {discount > 0 && (
        <div className="flex justify-between gap-4">
          <dt>
            {voucherCode ? discountLabel(voucherCode) : ORDER_COPY.discount}
          </dt>
          <dd className="tabular-nums">−{formatPeso(discount)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
        <dt>{ORDER_COPY.total}</dt>
        <dd className="tabular-nums">{formatPeso(total)}</dd>
      </div>
    </dl>
  )
}
