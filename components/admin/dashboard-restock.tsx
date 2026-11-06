import Link from "next/link"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DASHBOARD_COPY } from "@/lib/admin/dashboard-copy"
import { productInventoryHref } from "@/lib/admin/inventory-params"
import type { Dashboard } from "@/lib/admin/queries/dashboard"
import { cn, focusRing } from "@/lib/utils"

// The products that need restocking: out of stock first, then lowest stock
// (docs/specs/048-admin-dashboard, B6). Out and low are text, not colour only.

const copy = DASHBOARD_COPY.restock
const HEADING_ID = "dashboard-restock"

export function DashboardRestock({
  restock,
}: {
  restock: Dashboard["restock"]
}) {
  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-3">
      <h2 id={HEADING_ID} className="text-lg font-semibold">
        {copy.heading(restock.total)}
      </h2>
      {restock.items.length === 0 ? (
        <p className="rounded-md border p-4 text-muted-foreground">
          {copy.empty}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{copy.columns.product}</TableHead>
              <TableHead scope="col">{copy.columns.sku}</TableHead>
              <TableHead scope="col" className="text-right">
                {copy.columns.stock}
              </TableHead>
              <TableHead scope="col">{copy.columns.level}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {restock.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link
                    href={productInventoryHref(item.id)}
                    className={cn(
                      "font-medium underline underline-offset-4",
                      focusRing
                    )}
                  >
                    {item.name}
                  </Link>
                </TableCell>
                <TableCell>{item.sku}</TableCell>
                <TableCell className="text-right">{item.stock}</TableCell>
                <TableCell>{item.stock === 0 ? copy.out : copy.low}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {restock.total > restock.items.length ? (
        <p>
          <Link
            href="/admin/inventory?level=restock"
            className={cn("text-sm underline underline-offset-4", focusRing)}
          >
            {copy.viewAll(restock.total)}
          </Link>
        </p>
      ) : null}
    </section>
  )
}
