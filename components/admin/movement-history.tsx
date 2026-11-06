import Link from "next/link"

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
import { INVENTORY_COPY } from "@/lib/admin/inventory-copy"
import { productInventoryHref } from "@/lib/admin/inventory-params"
import { movementCells, unrecordedText } from "@/lib/admin/inventory-view"
import type { MovementList } from "@/lib/admin/queries/inventory"
import { cn, focusRing } from "@/lib/utils"

// A product's stock history (docs/specs/046-admin-inventory-adjustments, B14,
// B15, D7, D17): newest first, orders linked, the staff member or "System",
// and a closing line that says what isn't recorded. Takes the query's answer,
// so it is testable as markup with no session.

const COPY = INVENTORY_COPY.history

export function MovementHistory({
  productId,
  data,
}: {
  productId: string
  data: MovementList
}) {
  return (
    <section aria-labelledby="stock-history" className="flex flex-col gap-3">
      <h2 id="stock-history" className="text-lg font-semibold">
        {COPY.heading}
      </h2>

      {data.rows.length === 0 ? (
        <p className="rounded-md border p-4">{COPY.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableCaption className="sr-only">{COPY.caption}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{COPY.columns.when}</TableHead>
                <TableHead scope="col">{COPY.columns.reason}</TableHead>
                <TableHead scope="col" className="text-right">
                  {COPY.columns.change}
                </TableHead>
                <TableHead scope="col">{COPY.columns.order}</TableHead>
                <TableHead scope="col">{COPY.columns.by}</TableHead>
                <TableHead scope="col">{COPY.columns.note}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => {
                const cells = movementCells(row)
                return (
                  <TableRow key={cells.id}>
                    <TableCell className="whitespace-nowrap">
                      {cells.when}
                    </TableCell>
                    <TableCell>{cells.reason}</TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">
                      {cells.change}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {cells.orderNumber ? (
                        <Link
                          href={`/admin/orders/${encodeURIComponent(cells.orderNumber)}`}
                          className={cn(
                            "underline underline-offset-4",
                            focusRing
                          )}
                        >
                          {cells.orderNumber}
                        </Link>
                      ) : (
                        COPY.none
                      )}
                    </TableCell>
                    <TableCell>{cells.by}</TableCell>
                    <TableCell className="max-w-xs break-words whitespace-normal">
                      {cells.note}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {data.pageCount > 1 ? (
        <nav
          aria-label={COPY.paginationLabel}
          className="flex items-center justify-between gap-3"
        >
          {data.page > 1 ? (
            <Link
              href={productInventoryHref(productId, data.page - 1)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                focusRing
              )}
            >
              {INVENTORY_COPY.previous}
            </Link>
          ) : (
            <span />
          )}
          {data.page < data.pageCount ? (
            <Link
              href={productInventoryHref(productId, data.page + 1)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                focusRing
              )}
            >
              {INVENTORY_COPY.next}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      {data.firstAt ? (
        <p className="text-sm text-muted-foreground">
          {unrecordedText(data.firstAt)}
        </p>
      ) : null}
    </section>
  )
}
