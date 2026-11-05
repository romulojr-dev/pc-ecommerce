import Link from "next/link"

import { OrderBadges } from "@/components/admin/order-badges"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ADMIN_COPY } from "@/lib/admin/copy"
import {
  hasActiveFilters,
  ORDERS_PATH,
  type OrderParams,
  orderParamsHref,
} from "@/lib/admin/orders-params"
import { FULFILLMENT_LABELS, paymentCell } from "@/lib/admin/orders-view"
import type { OrderList as OrderListData } from "@/lib/admin/queries/orders"
import { formatPeso } from "@/lib/format"
import { dateTimeText } from "@/lib/orders/time"
import { cn, focusRing } from "@/lib/utils"

// The order list (docs/specs/041-admin-orders-list-detail, B1–B4, B9): one row
// per order, newest first, with the true status, the badges and the flags.
// Takes the query's answer, so it is testable as markup with no session.

export const RESULTS_ID = "orders-results"

export function orderHref(orderNumber: string): string {
  return `${ORDERS_PATH}/${encodeURIComponent(orderNumber)}`
}

export function OrderListView({
  data,
  params,
}: {
  data: OrderListData
  params: OrderParams
}) {
  const copy = ADMIN_COPY.orders
  const filtered = hasActiveFilters(params)
  return (
    <section aria-labelledby={RESULTS_ID} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2
          id={RESULTS_ID}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          {copy.count(data.total)}
        </h2>
        <p className="text-sm text-muted-foreground">
          {copy.pageOf(data.page, data.pageCount)}
        </p>
      </div>

      {data.rows.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-md border p-6">
          <p>{filtered ? copy.noMatch : copy.empty}</p>
          {filtered ? (
            <Link
              href={ORDERS_PATH}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                focusRing
              )}
            >
              {copy.filters.clear}
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableCaption className="sr-only">{copy.caption}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{copy.columns.number}</TableHead>
                <TableHead scope="col">{copy.columns.placed}</TableHead>
                <TableHead scope="col">{copy.columns.customer}</TableHead>
                <TableHead scope="col">{copy.columns.status}</TableHead>
                <TableHead scope="col">{copy.columns.payment}</TableHead>
                <TableHead scope="col">{copy.columns.fulfillment}</TableHead>
                <TableHead scope="col" className="text-right">
                  {copy.columns.total}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.orderNumber}>
                  <TableCell>
                    <Link
                      href={orderHref(row.orderNumber)}
                      className={cn(
                        "font-medium underline underline-offset-4",
                        focusRing
                      )}
                    >
                      {row.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {dateTimeText(row.createdAt)}
                  </TableCell>
                  <TableCell>{row.customer.name}</TableCell>
                  <TableCell>
                    <OrderBadges
                      status={row.status}
                      dueForRelease={row.dueForRelease}
                      refundRequired={row.flags.refundRequired}
                      needsCheck={row.flags.needsCheck}
                    />
                  </TableCell>
                  <TableCell>{paymentCell(row)}</TableCell>
                  <TableCell>{FULFILLMENT_LABELS[row.fulfillment]}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatPeso(row.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data.pageCount > 1 ? (
        <nav
          aria-label={copy.paginationLabel}
          className="flex items-center justify-between gap-3"
        >
          {data.page > 1 ? (
            <Link
              href={orderParamsHref({ ...params, page: data.page - 1 })}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                focusRing
              )}
            >
              {copy.previous}
            </Link>
          ) : (
            <span />
          )}
          {data.page < data.pageCount ? (
            <Link
              href={orderParamsHref({ ...params, page: data.page + 1 })}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                focusRing
              )}
            >
              {copy.next}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  )
}
