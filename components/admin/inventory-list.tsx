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
import {
  hasActiveInventoryFilters,
  INVENTORY_PATH,
  type InventoryParams,
  inventoryHref,
  productInventoryHref,
} from "@/lib/admin/inventory-params"
import { levelLabel, statusLabel, stockLevel } from "@/lib/admin/inventory-view"
import type { InventoryList as InventoryListData } from "@/lib/admin/queries/inventory"
import { cn, focusRing } from "@/lib/utils"

// The inventory list (docs/specs/046-admin-inventory-adjustments, B4, B7): one
// row per product of any status, lowest stock first. Takes the query's answer,
// so it is testable as markup with no session.

export const INVENTORY_RESULTS_ID = "inventory-results"

export function InventoryListView({
  data,
  params,
}: {
  data: InventoryListData
  params: InventoryParams
}) {
  const copy = INVENTORY_COPY
  const filtered = hasActiveInventoryFilters(params)
  return (
    <section
      aria-labelledby={INVENTORY_RESULTS_ID}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-baseline gap-3">
        <h2
          id={INVENTORY_RESULTS_ID}
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
          <p>{filtered ? copy.emptyFiltered : copy.empty}</p>
          {filtered ? (
            <Link
              href={INVENTORY_PATH}
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
                <TableHead scope="col">{copy.columns.name}</TableHead>
                <TableHead scope="col">{copy.columns.sku}</TableHead>
                <TableHead scope="col">{copy.columns.category}</TableHead>
                <TableHead scope="col">{copy.columns.status}</TableHead>
                <TableHead scope="col" className="text-right">
                  {copy.columns.stock}
                </TableHead>
                <TableHead scope="col" className="text-right">
                  {copy.columns.lowStockAt}
                </TableHead>
                <TableHead scope="col">{copy.columns.level}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => {
                const level = levelLabel(stockLevel(row))
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={productInventoryHref(row.id)}
                        className={cn(
                          "font-medium underline underline-offset-4",
                          focusRing
                        )}
                      >
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.sku}
                    </TableCell>
                    <TableCell>{row.categoryName}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="rounded border px-1.5 py-0.5 text-xs">
                        {statusLabel(row.status)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{row.stock}</TableCell>
                    <TableCell className="text-right">
                      {row.lowStockAt}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {level ? (
                        <span className="rounded border px-1.5 py-0.5 text-xs font-medium">
                          {level}
                        </span>
                      ) : null}
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
          aria-label={copy.paginationLabel}
          className="flex items-center justify-between gap-3"
        >
          {data.page > 1 ? (
            <Link
              href={inventoryHref({ ...params, page: data.page - 1 })}
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
              href={inventoryHref({ ...params, page: data.page + 1 })}
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
