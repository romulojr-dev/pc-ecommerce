import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ADMIN_COPY } from "@/lib/admin/copy"
import {
  CUSTOMERS_PATH,
  type CustomerParams,
} from "@/lib/admin/customers-params"
import { READ_ONLY_MESSAGE } from "@/lib/admin/denial"
import { customerTooShort } from "@/lib/admin/orders-params"
import { cn, focusRing } from "@/lib/utils"

// The search form of the customer list (docs/specs/042-admin-customers, B8,
// B9): a plain GET form, so it works without JavaScript and a search is a URL.
// Submitting leaves out the page, so a new search starts at page 1. A disabled
// field isn't submitted, which is how Demo's box stays out of the URL.

export const CUSTOMERS_RESULTS_ID = "customers-results"

export function CustomerSearch({
  params,
  canSearch,
}: {
  params: CustomerParams
  canSearch: boolean
}) {
  const copy = ADMIN_COPY.customers.search
  const tooShort = canSearch && customerTooShort(params.customer)
  return (
    <form
      method="get"
      action={`${CUSTOMERS_PATH}#${CUSTOMERS_RESULTS_ID}`}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="customer-search">{copy.label}</Label>
        {canSearch ? (
          <Input
            id="customer-search"
            name="customer"
            defaultValue={params.customer}
            maxLength={100}
            autoComplete="off"
            aria-describedby={tooShort ? "customer-search-hint" : undefined}
          />
        ) : (
          <Input
            id="customer-search"
            disabled
            placeholder={READ_ONLY_MESSAGE}
          />
        )}
        {tooShort ? (
          <p
            id="customer-search-hint"
            className="text-xs text-muted-foreground"
          >
            {copy.tooShort}
          </p>
        ) : null}
      </div>
      {canSearch ? (
        <button
          type="submit"
          className={cn(buttonVariants({ size: "default" }), focusRing)}
        >
          {copy.submit}
        </button>
      ) : null}
      {canSearch && params.customer ? (
        <Link
          href={CUSTOMERS_PATH}
          className={cn(buttonVariants({ variant: "ghost" }), focusRing)}
        >
          {copy.clear}
        </Link>
      ) : null}
    </form>
  )
}
