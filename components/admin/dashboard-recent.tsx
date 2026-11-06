import Link from "next/link"

import { OrderBadges } from "@/components/admin/order-badges"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DASHBOARD_COPY } from "@/lib/admin/dashboard-copy"
import type { OrderListRow } from "@/lib/admin/queries/orders"
import { formatPeso } from "@/lib/format"
import { dateTimeText } from "@/lib/orders/time"
import { cn, focusRing } from "@/lib/utils"

// The newest orders, with the customer already masked for Demo by the query
// (docs/specs/048-admin-dashboard, B7). Same status badges as the order list.

const copy = DASHBOARD_COPY.recent
const HEADING_ID = "dashboard-recent"

export function DashboardRecent({ rows }: { rows: OrderListRow[] }) {
  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-3">
      <h2 id={HEADING_ID} className="text-lg font-semibold">
        {copy.heading}
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-md border p-4 text-muted-foreground">
          {copy.empty}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{copy.columns.number}</TableHead>
              <TableHead scope="col">{copy.columns.placed}</TableHead>
              <TableHead scope="col">{copy.columns.customer}</TableHead>
              <TableHead scope="col">{copy.columns.status}</TableHead>
              <TableHead scope="col" className="text-right">
                {copy.columns.total}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.orderNumber}>
                <TableCell>
                  <Link
                    href={`/admin/orders/${encodeURIComponent(row.orderNumber)}`}
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
                <TableCell className="text-right whitespace-nowrap">
                  {formatPeso(row.total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p>
        <Link
          href="/admin/orders"
          className={cn("text-sm underline underline-offset-4", focusRing)}
        >
          {copy.viewAll}
        </Link>
      </p>
    </section>
  )
}
