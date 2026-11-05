import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ADMIN_COPY } from "@/lib/admin/copy"
import { READ_ONLY_MESSAGE } from "@/lib/admin/denial"
import {
  customerTooShort,
  hasActiveFilters,
  ORDER_STATUSES,
  ORDERS_PATH,
  type OrderParams,
} from "@/lib/admin/orders-params"
import { statusLabel } from "@/lib/orders/timeline"
import { cn, focusRing } from "@/lib/utils"

// The filter form of the order list (docs/specs/041-admin-orders-list-detail,
// B5–B7, R17): a plain GET form, so it works without JavaScript and a search
// is a URL. Submitting leaves out the page, so a new search starts at page 1.
// A disabled field isn't submitted, which is how Demo's customer box stays
// out of the URL.

const selectClass =
  "h-7 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 text-xs/relaxed outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"

export function OrderFilters({
  params,
  canSearchCustomer,
  resultsId,
}: {
  params: OrderParams
  canSearchCustomer: boolean
  resultsId: string
}) {
  const { filters } = ADMIN_COPY.orders
  const tooShort = canSearchCustomer && customerTooShort(params.customer)
  return (
    <form
      method="get"
      action={`${ORDERS_PATH}#${resultsId}`}
      className="flex flex-wrap items-end gap-3"
    >
      {params.buyer ? (
        <input type="hidden" name="buyer" value={params.buyer} />
      ) : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor="order-status">{filters.status}</Label>
        <select
          id="order-status"
          name="status"
          defaultValue={params.status ?? ""}
          className={selectClass}
        >
          <option value="">{filters.allStatuses}</option>
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="order-payment">{filters.payment}</Label>
        <select
          id="order-payment"
          name="payment"
          defaultValue={params.payment ?? ""}
          className={selectClass}
        >
          <option value="">{filters.allPayments}</option>
          <option value="online">{filters.online}</option>
          <option value="cod">{filters.cod}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="order-number">{filters.number}</Label>
        <Input
          id="order-number"
          name="number"
          defaultValue={params.number}
          maxLength={100}
          autoComplete="off"
          placeholder="PCS-…"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="order-customer">{filters.customer}</Label>
        {canSearchCustomer ? (
          <Input
            id="order-customer"
            name="customer"
            defaultValue={params.customer}
            maxLength={100}
            autoComplete="off"
            placeholder={filters.customerPlaceholder}
            aria-describedby={tooShort ? "order-customer-hint" : undefined}
          />
        ) : (
          <Input id="order-customer" disabled placeholder={READ_ONLY_MESSAGE} />
        )}
        {tooShort ? (
          <p id="order-customer-hint" className="text-xs text-muted-foreground">
            {filters.customerTooShort}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        className={cn(buttonVariants({ size: "default" }), focusRing)}
      >
        {filters.search}
      </button>
      {hasActiveFilters(params) ? (
        <Link
          href={ORDERS_PATH}
          className={cn(buttonVariants({ variant: "ghost" }), focusRing)}
        >
          {filters.clear}
        </Link>
      ) : null}
    </form>
  )
}
