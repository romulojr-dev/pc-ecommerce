import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { INVENTORY_COPY } from "@/lib/admin/inventory-copy"
import {
  CATEGORY_SLUGS,
  hasActiveInventoryFilters,
  INVENTORY_PATH,
  type InventoryParams,
} from "@/lib/admin/inventory-params"
import { builderCategories } from "@/lib/specs"
import { cn, focusRing } from "@/lib/utils"

// The filter form of the inventory list (docs/specs/046-admin-inventory-
// adjustments, B5): a plain GET form, so a search is a URL and works without
// JavaScript. Submitting leaves out the page, so a new search starts at page 1.

const selectClass =
  "h-7 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 text-xs/relaxed outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"

export function InventoryFilters({
  params,
  resultsId,
}: {
  params: InventoryParams
  resultsId: string
}) {
  const copy = INVENTORY_COPY.filters
  return (
    <form
      method="get"
      action={`${INVENTORY_PATH}#${resultsId}`}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="inventory-q">{copy.search}</Label>
        <Input
          id="inventory-q"
          name="q"
          defaultValue={params.q}
          maxLength={100}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="inventory-category">{copy.category}</Label>
        <select
          id="inventory-category"
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
        <Label htmlFor="inventory-level">{copy.level}</Label>
        <select
          id="inventory-level"
          name="level"
          defaultValue={params.level ?? ""}
          className={selectClass}
        >
          <option value="">{copy.all}</option>
          <option value="low">{copy.low}</option>
          <option value="out">{copy.out}</option>
          <option value="restock">{copy.restock}</option>
        </select>
      </div>
      <button
        type="submit"
        className={cn(buttonVariants({ size: "default" }), focusRing)}
      >
        {copy.submit}
      </button>
      {hasActiveInventoryFilters(params) ? (
        <Link
          href={INVENTORY_PATH}
          className={cn(buttonVariants({ variant: "ghost" }), focusRing)}
        >
          {copy.clear}
        </Link>
      ) : null}
    </form>
  )
}
