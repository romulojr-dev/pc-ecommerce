import Link from "next/link"

import { OrderBadges } from "@/components/admin/order-badges"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  OrderItemsList,
  OrderTotalsRows,
} from "@/components/orders/order-parts"
import { OrderTimeline } from "@/components/orders/order-timeline"
import { ADMIN_COPY } from "@/lib/admin/copy"
import { buyerHref } from "@/lib/admin/customers-view"
import {
  amountToCollect,
  EMAIL_STATUS_LABELS,
  EMAIL_TYPE_LABELS,
  FULFILLMENT_LABELS,
  PAYMENT_PROBLEM_LABELS,
  PAYMENT_STATUS_LABELS,
  paymentCell,
} from "@/lib/admin/orders-view"
import type {
  EmailRecord,
  OrderDetail,
  PaymentAttempt,
} from "@/lib/admin/queries/orders"
import { formatPeso } from "@/lib/format"
import { dateTimeText } from "@/lib/orders/time"
import { orderTimeline } from "@/lib/orders/timeline"
import { cn, focusRing } from "@/lib/utils"

// The order detail (docs/specs/041-admin-orders-list-detail, B10–B14): the
// whole order for staff, read only. Takes the query's DTO, so Demo's masked
// values are all it can show. The sections follow the spec's order.

const copy = ADMIN_COPY.orders.detail

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-md border p-4"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value ?? "—"}</dd>
    </div>
  )
}

function ContactSection({ order }: { order: OrderDetail }) {
  const { contact } = order
  return (
    <Section title={copy.contact}>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Fact label={copy.name} value={contact.name} />
        <Fact label={copy.emailLabel} value={contact.email} />
        <Fact label={copy.mobile} value={contact.mobile} />
      </dl>
      {order.customerKey ? (
        <Link
          href={buyerHref(order.customerKey)}
          className={cn(
            "w-fit text-sm underline underline-offset-4",
            focusRing
          )}
        >
          {copy.viewCustomer}
        </Link>
      ) : null}
    </Section>
  )
}

function AddressSection({ order }: { order: OrderDetail }) {
  const { address } = order
  if (address.kind === "pickup") {
    return (
      <Section title={copy.pickup}>
        <p className="text-sm">{copy.storePickup}</p>
      </Section>
    )
  }
  return (
    <Section title={copy.delivery}>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Fact label={copy.region} value={address.regionName} />
        <Fact label={copy.zone} value={address.zone} />
        {address.masked ? null : (
          <>
            <Fact label={copy.street} value={address.street} />
            <Fact label={copy.barangay} value={address.barangayName} />
            <Fact label={copy.city} value={address.cityName} />
            <Fact label={copy.province} value={address.provinceName} />
            <Fact label={copy.zip} value={address.zip} />
          </>
        )}
      </dl>
    </Section>
  )
}

function TimelineSection({ order, now }: { order: OrderDetail; now: Date }) {
  const events = [
    copy.events.placed(dateTimeText(order.createdAt)),
    order.paidAt ? copy.events.paid(dateTimeText(order.paidAt)) : null,
    order.confirmedAt
      ? copy.events.confirmed(dateTimeText(order.confirmedAt))
      : null,
    order.cancelledAt
      ? copy.events.cancelled(dateTimeText(order.cancelledAt))
      : null,
    order.cancelReason === "EXPIRED" ? copy.events.notPaidInTime : null,
  ].filter((event): event is string => event !== null)
  const pending =
    order.status === "PENDING_PAYMENT" ||
    order.status === "PENDING_CONFIRMATION"
  const deadline = pending
    ? order.expiresAt.getTime() <= now.getTime()
      ? copy.wasDue(dateTimeText(order.expiresAt))
      : copy.due(dateTimeText(order.expiresAt))
    : null
  return (
    <Section title={copy.status}>
      <OrderTimeline
        timeline={orderTimeline({
          status: order.status,
          fulfillment: order.fulfillment,
          paymentOption: order.paymentOption,
          confirmedAt: order.confirmedAt,
        })}
      />
      <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
        {events.map((event) => (
          <li key={event}>{event}</li>
        ))}
        {deadline ? <li>{deadline}</li> : null}
      </ul>
    </Section>
  )
}

function PaymentRows({ payments }: { payments: PaymentAttempt[] }) {
  const p = copy.payment
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{p.reference}</TableHead>
            <TableHead scope="col">{p.provider}</TableHead>
            <TableHead scope="col">{p.status}</TableHead>
            <TableHead scope="col">{p.amount}</TableHead>
            <TableHead scope="col">{p.channel}</TableHead>
            <TableHead scope="col">{p.session}</TableHead>
            <TableHead scope="col">{p.gatewayPayment}</TableHead>
            <TableHead scope="col">{p.created}</TableHead>
            <TableHead scope="col">{p.paid}</TableHead>
            <TableHead scope="col">{p.sessionExpires}</TableHead>
            <TableHead scope="col">{p.problem}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => (
            <TableRow
              key={payment.referenceId + payment.createdAt.toISOString()}
            >
              <TableCell className="whitespace-nowrap">
                {payment.referenceId}
              </TableCell>
              <TableCell>{payment.provider}</TableCell>
              <TableCell>{PAYMENT_STATUS_LABELS[payment.status]}</TableCell>
              <TableCell className="whitespace-nowrap">
                {formatPeso(payment.amount)}
              </TableCell>
              <TableCell>{payment.method ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs">
                {payment.sessionId ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {payment.gatewayPaymentId ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {dateTimeText(payment.createdAt)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {payment.paidAt ? dateTimeText(payment.paidAt) : "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {dateTimeText(payment.sessionExpiresAt)}
              </TableCell>
              <TableCell>
                {payment.problem ? (
                  <span>
                    {PAYMENT_PROBLEM_LABELS[payment.problem]}
                    {payment.receivedAmount !== null &&
                    payment.receivedAmount !== payment.amount
                      ? ` (${p.received(formatPeso(payment.receivedAmount))})`
                      : ""}
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function EmailRows({ emails }: { emails: EmailRecord[] }) {
  const e = copy.email
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{e.type}</TableHead>
            <TableHead scope="col">{e.status}</TableHead>
            <TableHead scope="col">{e.attempts}</TableHead>
            <TableHead scope="col">{e.sent}</TableHead>
            <TableHead scope="col">{e.code}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {emails.map((email) => (
            <TableRow key={email.type}>
              <TableCell>{EMAIL_TYPE_LABELS[email.type]}</TableCell>
              <TableCell>{EMAIL_STATUS_LABELS[email.status]}</TableCell>
              <TableCell>{email.attempts}</TableCell>
              <TableCell className="whitespace-nowrap">
                {email.sentAt ? dateTimeText(email.sentAt) : "—"}
              </TableCell>
              <TableCell>{email.lastErrorCode ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function OrderDetailView({
  order,
  now,
  backHref,
  slipHref,
}: {
  order: OrderDetail
  now: Date
  // The list as the staff member left it (B11)
  backHref: string
  // Null when the role has no packing slip
  slipHref: string | null
}) {
  const collect = amountToCollect(order)
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <Link
          href={backHref}
          className={cn("text-sm underline underline-offset-4", focusRing)}
        >
          {copy.back}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{order.orderNumber}</h1>
          <OrderBadges
            status={order.status}
            dueForRelease={order.dueForRelease}
            refundRequired={order.flags.refundRequired}
            needsCheck={order.flags.needsCheck}
          />
          {slipHref ? (
            <Link
              href={slipHref}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                focusRing
              )}
            >
              {copy.packingSlip}
            </Link>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {dateTimeText(order.createdAt)} ·{" "}
          {FULFILLMENT_LABELS[order.fulfillment]} · {paymentCell(order)}
        </p>
      </header>

      {order.flags.refundRequired ? (
        <p role="note" className="rounded-md border border-destructive/40 p-3">
          {copy.refundFlag}
        </p>
      ) : null}
      {order.flags.needsCheck ? (
        <p role="note" className="rounded-md border border-destructive/40 p-3">
          {copy.checkFlag}
        </p>
      ) : null}

      <Section title={copy.items}>
        <OrderItemsList items={order.items} />
      </Section>

      <Section title={copy.totals}>
        {collect ? <p className="text-lg font-semibold">{collect}</p> : null}
        <OrderTotalsRows
          subtotal={order.subtotal}
          shippingFee={order.shippingFee}
          fulfillment={order.fulfillment}
          discount={order.discount}
          voucherCode={order.voucherCode}
          total={order.total}
        />
        <p className="text-sm text-muted-foreground">
          {copy.weight(order.weightGrams)}
        </p>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <ContactSection order={order} />
        <AddressSection order={order} />
      </div>

      <TimelineSection order={order} now={now} />

      <Section title={copy.payments}>
        {order.paymentOption === "COD" ? (
          <p className="text-sm">
            {order.fulfillment === "PICKUP"
              ? copy.pickupNoPayment
              : copy.cashNoPayment}
          </p>
        ) : null}
        {order.payments.length > 0 ? (
          <PaymentRows payments={order.payments} />
        ) : order.paymentOption === "ONLINE" ? (
          <p className="text-sm">{copy.noPayments}</p>
        ) : null}
      </Section>

      <Section title={copy.emails}>
        {order.emails.length > 0 ? (
          <EmailRows emails={order.emails} />
        ) : (
          <p className="text-sm">{copy.noEmails}</p>
        )}
      </Section>
    </div>
  )
}
