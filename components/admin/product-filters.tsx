import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { IMAGE_UI } from "@/lib/admin/images-copy"
import { PRODUCT_COPY } from "@/lib/admin/products-copy"
import {
  CATEGORY_SLUGS,
  hasActiveProductFilters,
  PRODUCTS_PATH,
  type ProductParams,
} from "@/lib/admin/products-params"
import { builderCategories } from "@/lib/specs"
import { cn, focusRing } from "@/lib/utils"

// The filter form of the product list (docs/specs/045-admin-products-create-
// edit, B5): a plain GET form, so a search is a URL and works without
// JavaScript. Submitting leaves out the page, so a new search starts at page 1.

const selectClass =
  "h-7 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 text-xs/relaxed outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"

export function ProductFilters({
  params,
  resultsId,
}: {
  params: ProductParams
  resultsId: string
}) {
  const copy = PRODUCT_COPY.filters
  return (
    <form
      method="get"
      action={`${PRODUCTS_PATH}#${resultsId}`}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="product-q">{copy.search}</Label>
        <Input
          id="product-q"
          name="q"
          defaultValue={params.q}
          maxLength={100}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="product-category">{copy.category}</Label>
        <select
          id="product-category"
          name="category"
          defaultValue={params.category ?? ""}
          className={selectClass}
        >
          <option value="">{copy.allCategories}</option>
          {CATEGORY_SLUGS.map((slug) => (
            <option key={slug} value={slug}>
              {builderCategories[slug].name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="product-status">{copy.status}</Label>
        <select
          id="product-status"
          name="status"
          defaultValue={params.status ?? ""}
          className={selectClass}
        >
          <option value="">{copy.allStatuses}</option>
          <option value="draft">{copy.draft}</option>
          <option value="active">{copy.active}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="product-photos">{IMAGE_UI.filterLabel}</Label>
        <select
          id="product-photos"
          name="photos"
          defaultValue={params.photos ?? ""}
          className={selectClass}
        >
          <option value="">{IMAGE_UI.filterAny}</option>
          <option value="missing">{IMAGE_UI.filterMissing}</option>
        </select>
      </div>
      <button
        type="submit"
        className={cn(buttonVariants({ size: "default" }), focusRing)}
      >
        {copy.submit}
      </button>
      {hasActiveProductFilters(params) ? (
        <Link
          href={PRODUCTS_PATH}
          className={cn(buttonVariants({ variant: "ghost" }), focusRing)}
        >
          {copy.clear}
        </Link>
      ) : null}
    </form>
  )
}
