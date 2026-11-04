import { TestModeBanner } from "@/components/checkout/test-mode-banner"
import { CopyLink } from "@/components/orders/copy-link"
import { OrderTimeline } from "@/components/orders/order-timeline"
import { PaymentPanel } from "@/components/orders/payment-panel"
import {
  OrderItemsList,
  OrderTotalsRows,
} from "@/components/orders/order-parts"
import { addressLines } from "@/lib/checkout/copy"
import {
  checkEmailText,
  COD_ORDER_COPY,
  codConfirmedText,
  ORDER_COPY,
  orderHeading,
  paymentOptionText,
} from "@/lib/orders/copy"
import { payByText, placedOnText } from "@/lib/orders/time"
import {
  type OrderStatusName,
  orderTimeline,
  statusLabel,
} from "@/lib/orders/timeline"
import type { OrderPageData } from "@/lib/orders/view"
import { PAY_COPY, paidLine } from "@/lib/payments/copy"
import type { PaymentView } from "@/lib/payments/payment-view"

// The order page's content (docs/specs/030-place-an-order, Behavior 18), drawn
// from the order's snapshots and nothing else. A server component: only
// CopyLink and the payment panel need the browser. The page computes the
// payment view (docs/specs/031-pay-with-xendit, paymentView) from the order,
// the URL's `payment=` value and the time, so this is a pure function of its
// props.

export type OrderPayment = {
  view: PaymentView
  // The gateway's test instructions, for the banner (FR-27)
  instructions: string
  // Who "Still confirming" waits for
  gatewayName: string
  // The address the confirmation email comes from, named on a cash order that
  // waits for it (docs/specs/038-cash-on-delivery, Behavior 25)
  confirmSender: string
}

// A confirmed cash order that hasn't been delivered yet: what to pay and when
const CONFIRMED_NOTE: readonly OrderStatusName[] = [
  "COD_CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "READY_FOR_PICKUP",
]

export function OrderView({
  order,
  payment,
}: {
  order: OrderPageData
  payment: OrderPayment
}) {
  const { view } = payment
  // Past expiresAt the order reads as cancelled, released or not yet
  // (docs/specs/033-release-unpaid-orders, behavior 31–32)
  const expired = view === "expired" || order.cancelReason === "EXPIRED"
  const status = view === "expired" ? "CANCELLED" : order.status
  const timeline = orderTimeline({ ...order, status })
  const cash = order.paymentOption === "COD"
  const pickup = order.fulfillment === "PICKUP"
  const lines = order.address ? addressLines({ ...order.address }) : null

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {orderHeading(order.orderNumber)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {placedOnText(order.createdAt)} · {statusLabel(status)}
        </p>
      </header>

      <section aria-labelledby="order-status" className="flex flex-col gap-3">
        <h2 id="order-status" className="sr-only">
          {ORDER_COPY.statusHeading}
        </h2>
        <OrderTimeline timeline={timeline} />
        {(expired || order.paidAt || order.refundRequired) && (
          <div className="flex flex-col gap-1 text-sm">
            {expired && (
              <p>
                {cash
                  ? COD_ORDER_COPY.cancelledNotConfirmed
                  : ORDER_COPY.cancelledExpired}
              </p>
            )}
            {order.paidAt && (
              <p>{paidLine(order.paidAt, order.paymentMethod)}</p>
            )}
            {order.refundRequired && (
              <p className="font-medium">
                {status === "CANCELLED" || status === "REFUNDED"
                  ? PAY_COPY.latePayment
                  : PAY_COPY.secondPayment}
              </p>
            )}
          </div>
        )}
        {status === "PENDING_CONFIRMATION" && (
          <p className="text-sm font-medium">
            {checkEmailText(payment.confirmSender, order.expiresAt)}
          </p>
        )}
        {CONFIRMED_NOTE.includes(status) && (
          <p className="text-sm">{codConfirmedText(order.total, pickup)}</p>
        )}
        {view === "needs-check" && (
          <p className="text-sm font-medium">{PAY_COPY.needsCheck}</p>
        )}
        {view !== "none" && view !== "needs-check" && view !== "expired" && (
          <div className="flex flex-col gap-3 text-sm">
            <TestModeBanner instructions={payment.instructions} />
            <p className="font-medium">{payByText(order.expiresAt)}</p>
            <PaymentPanel
              orderNumber={order.orderNumber}
              view={view}
              gatewayName={payment.gatewayName}
            />
          </div>
        )}
      </section>

      {!order.viaLink && <CopyLink />}

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-8">
          <section
            aria-labelledby="order-items"
            className="flex flex-col gap-2"
          >
            <h2 id="order-items" className="text-base font-medium">
              {ORDER_COPY.itemsHeading}
            </h2>
            <OrderItemsList items={order.items} />
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
          <OrderTotalsRows
            subtotal={order.subtotal}
            shippingFee={order.shippingFee}
            fulfillment={order.fulfillment}
            discount={order.discount}
            voucherCode={order.voucherCode}
            total={order.total}
          />
          {cash && (
            <dl className="border-t pt-3">
              <div className="flex justify-between gap-4">
                <dt>{COD_ORDER_COPY.paymentRow}</dt>
                <dd>{paymentOptionText(pickup)}</dd>
              </div>
            </dl>
          )}
        </aside>
      </div>
    </div>
  )
}
