import Link from "next/link"

import { CodConfirmButton } from "@/components/orders/cod-confirm-button"
import {
  OrderItemsList,
  OrderTotalsRows,
} from "@/components/orders/order-parts"
import { buttonVariants } from "@/components/ui/button"
import { addressLines } from "@/lib/checkout/copy"
import type { CodConfirmPageData } from "@/lib/orders/get-cod-confirm"
import {
  COD_ORDER_COPY,
  codConfirmedText,
  confirmLead,
  confirmPayLine,
  ORDER_COPY,
} from "@/lib/orders/copy"
import { cn, focusRing } from "@/lib/utils"

// The cash order's confirmation page (docs/specs/038-cash-on-delivery,
// Behavior 17, D8). Opening it writes nothing: the only thing here that does is
// the Confirm order button, a POST. A pure function of its props, so what each
// view says is tested as markup. It shows no contact details.
export function CodConfirmView({
  data,
  link,
}: {
  data: CodConfirmPageData
  link: { sig: string; exp: string; p: string }
}) {
  const pickup = data.fulfillment === "PICKUP"

  if (data.view !== "confirm") {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {COD_ORDER_COPY.confirmHeading}
        </h1>
        <p className="text-sm text-muted-foreground">{data.orderNumber}</p>
        {data.view === "confirmed" ? (
          <>
            <p className="text-sm font-medium">
              {COD_ORDER_COPY.alreadyConfirmed}
            </p>
            <p className="text-sm">{codConfirmedText(data.total, pickup)}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">
              {COD_ORDER_COPY.cancelledNotConfirmed}
            </p>
            <Link
              href="/"
              className={cn(
                buttonVariants({ variant: "outline" }),
                focusRing,
                "w-fit"
              )}
            >
              {COD_ORDER_COPY.visitShop}
            </Link>
          </>
        )}
      </div>
    )
  }

  const lines = data.address ? addressLines({ ...data.address }) : null
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {COD_ORDER_COPY.confirmHeading}
        </h1>
        <p className="text-sm">
          {confirmLead(data.orderNumber, data.expiresAt)}
        </p>
        <p className="text-sm text-muted-foreground">
          {confirmPayLine(data.total, pickup)}
        </p>
        <CodConfirmButton orderNumber={data.orderNumber} link={link} />
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-8">
          <section
            aria-labelledby="confirm-items"
            className="flex flex-col gap-2"
          >
            <h2 id="confirm-items" className="text-base font-medium">
              {ORDER_COPY.itemsHeading}
            </h2>
            <OrderItemsList items={data.items} />
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
                <p className="whitespace-pre-line">{data.store?.address}</p>
                <p className="whitespace-pre-line text-muted-foreground">
                  {data.store?.hours}
                </p>
                <p className="mt-2">{ORDER_COPY.pickupNote}</p>
              </>
            )}
          </section>
        </div>

        <aside
          aria-label={ORDER_COPY.summaryHeading}
          className="flex flex-col gap-3 rounded-lg border p-5 text-sm lg:sticky lg:top-6"
        >
          <OrderTotalsRows
            subtotal={data.subtotal}
            shippingFee={data.shippingFee}
            fulfillment={data.fulfillment}
            discount={data.discount}
            voucherCode={data.voucherCode}
            total={data.total}
          />
        </aside>
      </div>
    </div>
  )
}
