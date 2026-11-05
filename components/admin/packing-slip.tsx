import Link from "next/link"

import { PrintButton } from "@/components/admin/print-button"
import { buttonVariants } from "@/components/ui/button"
import { ADMIN_COPY } from "@/lib/admin/copy"
import {
  FULFILLMENT_LABELS,
  slipEntries,
  slipPaymentLine,
  slipWarning,
} from "@/lib/admin/orders-view"
import type { PackingSlip as PackingSlipData } from "@/lib/admin/queries/orders"
import { SLOT_COPY } from "@/lib/build-state/slots"
import type { Slot } from "@/lib/builder"
import { groupName } from "@/lib/cart/copy"
import { dateTimeText } from "@/lib/orders/time"
import { cn, focusRing } from "@/lib/utils"

// The packing slip (docs/specs/041-admin-orders-list-detail, B15–B20): one
// print-styled page per order, for the person packing it and the courier.
// There is no price anywhere on it, because its data has none; the mobile
// number is there on purpose. Takes the query's DTO, so Demo's masks are all
// it can print.

const copy = ADMIN_COPY.orders.slip

const slotLabel = (slot: string | null): string =>
  slot === null ? "" : (SLOT_COPY[slot as Slot]?.name ?? slot)

function Line({
  name,
  quantity,
  hint,
}: {
  name: string
  quantity: number
  hint?: string
}) {
  return (
    <li className="flex break-inside-avoid items-start gap-3 py-2">
      <span
        aria-hidden="true"
        className="mt-0.5 inline-block size-4 shrink-0 border border-current"
      />
      <span className="flex-1">
        {hint ? (
          <span className="block text-xs text-muted-foreground print:text-black">
            {hint}
          </span>
        ) : null}
        {name}
      </span>
      <span className="font-medium tabular-nums">× {quantity}</span>
    </li>
  )
}

function ShipTo({ slip }: { slip: PackingSlipData }) {
  const { contact, address } = slip
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-base font-semibold">
        {address.kind === "pickup" ? copy.pickupHeading : copy.shipTo}
      </h2>
      <p className="text-lg font-medium">{contact.name}</p>
      <p>
        {copy.mobile}: <span className="font-medium">{contact.mobile}</span>
      </p>
      {address.kind === "pickup" ? (
        <p>{copy.pickup}</p>
      ) : address.masked ? (
        <p>{address.regionName}</p>
      ) : (
        <address className="not-italic">
          {[address.street, address.barangayName].filter(Boolean).join(", ")}
          <br />
          {[address.cityName, address.provinceName, address.zip]
            .filter(Boolean)
            .join(", ")}
          <br />
          {address.regionName}
        </address>
      )}
    </section>
  )
}

export function PackingSlipView({
  slip,
  backHref,
}: {
  slip: PackingSlipData
  backHref: string
}) {
  const warning = slipWarning(slip.status)
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-5 bg-background p-2 print:max-w-none print:p-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href={backHref}
          className={cn("text-sm underline underline-offset-4", focusRing)}
        >
          {copy.back}
        </Link>
        <PrintButton
          className={cn(buttonVariants({ variant: "outline" }), focusRing)}
        >
          {copy.print}
        </PrintButton>
      </div>

      {warning ? (
        <p
          role="alert"
          className="border-2 border-current p-3 text-lg font-bold"
        >
          {warning}
        </p>
      ) : null}

      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
        <div>
          <p className="text-sm">{copy.store}</p>
          <h1 className="text-2xl font-semibold">{copy.heading}</h1>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold">{slip.orderNumber}</p>
          <p className="text-sm">
            {copy.placed} {dateTimeText(slip.createdAt)} ·{" "}
            {FULFILLMENT_LABELS[slip.fulfillment]}
          </p>
        </div>
      </header>

      <ShipTo slip={slip} />

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{copy.items}</h2>
        <ul className="divide-y border-y">
          {slipEntries(slip.items).map((entry, index) =>
            entry.kind === "single" ? (
              <Line
                key={index}
                name={entry.item.name}
                quantity={entry.item.quantity}
              />
            ) : (
              <li key={index} className="py-2">
                <p className="text-sm font-medium">{groupName(entry.number)}</p>
                <ul className="divide-y border-l pl-3">
                  {entry.parts.map((part, i) => (
                    <Line
                      key={i}
                      name={part.name}
                      quantity={part.quantity}
                      hint={slotLabel(part.slot)}
                    />
                  ))}
                </ul>
              </li>
            )
          )}
        </ul>
      </section>

      <footer className="flex flex-wrap justify-between gap-2 text-sm">
        <p>{copy.weight(slip.weightGrams)}</p>
        <p>
          {copy.payment}:{" "}
          <span className="font-medium">{slipPaymentLine(slip)}</span>
        </p>
      </footer>
    </article>
  )
}
