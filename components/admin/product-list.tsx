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
import { PRODUCT_COPY } from "@/lib/admin/products-copy"
import {
  hasActiveProductFilters,
  PRODUCTS_PATH,
  type ProductParams,
  productParamsHref,
} from "@/lib/admin/products-params"
import { priceCells, productStatusLabel } from "@/lib/admin/products-view"
import type { ProductList as ProductListData } from "@/lib/admin/queries/products"
import { formatPeso } from "@/lib/format"
import { cn, focusRing } from "@/lib/utils"

// The product list (docs/specs/045-admin-products-create-edit, B4, B7): one
// row per product of any status, most recently changed first. Takes the
// query's answer, so it is testable as markup with no session.

export const PRODUCTS_RESULTS_ID = "products-results"

export function productEditHref(id: string): string {
  return `${PRODUCTS_PATH}/${encodeURIComponent(id)}`
}

export function ProductListView({
  data,
  params,
}: {
  data: ProductListData
  params: ProductParams
}) {
  const copy = PRODUCT_COPY
  const filtered = hasActiveProductFilters(params)
  return (
    <section
      aria-labelledby={PRODUCTS_RESULTS_ID}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-baseline gap-3">
        <h2
          id={PRODUCTS_RESULTS_ID}
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
              href={PRODUCTS_PATH}
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
                <TableHead scope="col">{copy.columns.brand}</TableHead>
                <TableHead scope="col">{copy.columns.status}</TableHead>
                <TableHead scope="col" className="text-right">
                  {copy.columns.price}
                </TableHead>
                <TableHead scope="col" className="text-right">
                  {copy.columns.stock}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => {
                const price = priceCells(row.price, row.salePrice)
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={productEditHref(row.id)}
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
                    <TableCell>{row.brandName}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="rounded border px-1.5 py-0.5 text-xs">
                        {productStatusLabel(row.status)}
                      </span>
                      {row.isFeatured ? (
                        <span className="ml-1 rounded border px-1.5 py-0.5 text-xs">
                          {copy.badges.featured}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {formatPeso(price.current)}
                      {price.struck !== null ? (
                        <>
                          {" "}
                          <s className="text-muted-foreground">
                            {formatPeso(price.struck)}
                          </s>
                        </>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">{row.stock}</TableCell>
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
              href={productParamsHref({ ...params, page: data.page - 1 })}
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
              href={productParamsHref({ ...params, page: data.page + 1 })}
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
