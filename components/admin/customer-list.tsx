import Link from "next/link"

import { CUSTOMERS_RESULTS_ID } from "@/components/admin/customer-search"
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
  CUSTOMERS_PATH,
  type CustomerParams,
  customersHref,
} from "@/lib/admin/customers-params"
import { buyerHref } from "@/lib/admin/customers-view"
import type { CustomerList as CustomerListData } from "@/lib/admin/queries/customers"
import { formatPeso } from "@/lib/format"
import { dateTimeText } from "@/lib/orders/time"
import { cn, focusRing } from "@/lib/utils"

// The customer list (docs/specs/042-admin-customers, B1–B10): one row per
// customer, most recent order first. Takes the query's answer, so it is
// testable as markup with no session. The contact is already masked for Demo.

export function CustomerListView({
  data,
  params,
}: {
  data: CustomerListData
  params: CustomerParams
}) {
  const copy = ADMIN_COPY.customers
  const searching = params.customer !== ""
  return (
    <section
      aria-labelledby={CUSTOMERS_RESULTS_ID}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-baseline gap-3">
        <h2
          id={CUSTOMERS_RESULTS_ID}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          {copy.count(data.total)}
        </h2>
        <p className="text-sm text-muted-foreground">
          {ADMIN_COPY.orders.pageOf(data.page, data.pageCount)}
        </p>
      </div>

      {data.rows.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-md border p-6">
          <p>{searching ? copy.noMatch : copy.empty}</p>
          {searching ? (
            <Link
              href={CUSTOMERS_PATH}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                focusRing
              )}
            >
              {copy.search.clear}
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableCaption className="sr-only">{copy.caption}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{copy.columns.customer}</TableHead>
                <TableHead scope="col" className="text-right">
                  {copy.columns.orders}
                </TableHead>
                <TableHead scope="col" className="text-right">
                  {copy.columns.spent}
                </TableHead>
                <TableHead scope="col">{copy.columns.last}</TableHead>
                <TableHead scope="col">
                  <span className="sr-only">{copy.viewOrders}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.contact.name}</div>
                    <div className="text-xs break-all text-muted-foreground">
                      {row.contact.email}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{row.orderCount}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatPeso(row.totalSpent)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {dateTimeText(row.lastOrderAt)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={buyerHref(row.id)}
                      className={cn("underline underline-offset-4", focusRing)}
                    >
                      {copy.viewOrders}
                    </Link>
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
              href={customersHref({ ...params, page: data.page - 1 })}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                focusRing
              )}
            >
              {ADMIN_COPY.orders.previous}
            </Link>
          ) : (
            <span />
          )}
          {data.page < data.pageCount ? (
            <Link
              href={customersHref({ ...params, page: data.page + 1 })}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                focusRing
              )}
            >
              {ADMIN_COPY.orders.next}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  )
}
