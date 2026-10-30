"use client"

import Link from "next/link"
import { useEffect } from "react"

import { AddressFields } from "@/components/checkout/address-fields"
import { fieldId, TextField } from "@/components/checkout/fields"
import { ProblemsBox } from "@/components/checkout/problems-box"
import { Button } from "@/components/ui/button"
import { subtotalLabel } from "@/lib/cart/copy"
import type { CheckoutDraft } from "@/lib/checkout/draft"
import { draftPayload } from "@/lib/checkout/draft"
import { checkoutInputSchema, fieldErrors } from "@/lib/checkout/input"
import type { ReviewProblem } from "@/lib/checkout/problems"
import { formatPeso } from "@/lib/format"

// Step 1 (docs/specs/029-checkout-steps, Behavior 9–14): contact, delivery or
// pickup, and the address. It collects and checks in the browser; nothing is
// sent to the server here.

type Props = {
  draft: CheckoutDraft
  onChange: (next: CheckoutDraft) => void
  errors: Readonly<Record<string, string | undefined>>
  onErrors: (errors: Record<string, string>) => void
  pickupEnabled: boolean
  store: { address: string; hours: string }
  problems: readonly ReviewProblem[]
  summary: { count: number; subtotal: number }
  onContinue: () => void
}

// The first invalid field wins focus, in the order the form shows them
const FOCUS_ORDER: [path: string, id: string][] = [
  ["contact.email", fieldId("email")],
  ["contact.name", fieldId("name")],
  ["contact.mobile", fieldId("mobile")],
  ["method", fieldId("method-delivery")],
  ["address.regionCode", fieldId("region")],
  ["address.provinceCode", fieldId("province")],
  ["address.cityCode", fieldId("city")],
  ["address.barangayCode", fieldId("barangay")],
  ["address.street", fieldId("street")],
  ["address.zip", fieldId("zip")],
]

export function ContactDeliveryStep({
  draft,
  onChange,
  errors,
  onErrors,
  pickupEnabled,
  store,
  problems,
  summary,
  onContinue,
}: Props) {
  // Pickup switched off since the details were saved: delivery is the method
  const method = pickupEnabled ? draft.method : "delivery"
  useEffect(() => {
    if (draft.method !== method) onChange({ ...draft, method })
  })

  // A change clears the message of the field it touched
  const change = (next: CheckoutDraft, touched: readonly string[]) => {
    onChange(next)
    const cleared = new Set(
      touched.flatMap((key) => [
        `contact.${key}`,
        `address.${key}`,
        key === "method" ? "method" : "",
      ])
    )
    if (Object.keys(errors).some((path) => cleared.has(path))) {
      onErrors(
        Object.fromEntries(
          Object.entries(errors).filter(
            (entry): entry is [string, string] =>
              entry[1] !== undefined && !cleared.has(entry[0])
          )
        )
      )
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = checkoutInputSchema.safeParse(
      draftPayload({ ...draft, method })
    )
    if (parsed.success) {
      onErrors({})
      onContinue()
      return
    }
    const found = fieldErrors(parsed.error)
    onErrors(found)
    const first = FOCUS_ORDER.find(([path]) => found[path])
    if (first) document.getElementById(first[1])?.focus()
  }

  return (
    <div className="flex flex-col gap-6">
      {problems.length > 0 && <ProblemsBox problems={problems} />}
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_20rem]">
        <form noValidate onSubmit={submit} className="flex flex-col gap-8">
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 text-base font-medium">Contact</legend>
            <TextField
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              value={draft.email}
              error={errors["contact.email"]}
              onChange={(email) => change({ ...draft, email }, ["email"])}
            />
            <TextField
              name="name"
              label="Full name"
              autoComplete="name"
              value={draft.name}
              error={errors["contact.name"]}
              onChange={(name) => change({ ...draft, name }, ["name"])}
            />
            <TextField
              name="mobile"
              label="Mobile number"
              hint="We'll text you about your delivery."
              type="tel"
              autoComplete="tel"
              value={draft.mobile}
              error={errors["contact.mobile"]}
              onChange={(mobile) => change({ ...draft, mobile }, ["mobile"])}
            />
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-base font-medium">
              {pickupEnabled ? "Delivery method" : "Delivery"}
            </legend>
            {pickupEnabled && (
              <div className="flex flex-col gap-2 text-sm">
                {(["delivery", "pickup"] as const).map((value) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      id={fieldId(`method-${value}`)}
                      type="radio"
                      name="method"
                      value={value}
                      checked={method === value}
                      aria-describedby={
                        errors.method ? fieldId("method-error") : undefined
                      }
                      onChange={() =>
                        change({ ...draft, method: value }, ["method"])
                      }
                    />
                    {value === "delivery" ? "Delivery" : "Store pickup"}
                  </label>
                ))}
              </div>
            )}
            {errors.method && (
              <p
                id={fieldId("method-error")}
                className="text-xs text-destructive"
              >
                {errors.method}
              </p>
            )}
          </fieldset>

          {method === "delivery" ? (
            <fieldset className="flex flex-col gap-4">
              <legend className="mb-1 text-base font-medium">
                Delivery address
              </legend>
              <AddressFields
                draft={draft}
                errors={errors}
                onChange={(next, touched) => change(next, touched)}
              />
            </fieldset>
          ) : (
            <section className="flex flex-col gap-2">
              <h3 className="text-base font-medium">Pick up at</h3>
              <p className="text-sm whitespace-pre-line">{store.address}</p>
              <p className="text-sm whitespace-pre-line text-muted-foreground">
                {store.hours}
              </p>
            </section>
          )}

          <div>
            <Button type="submit" size="lg" className="h-10 px-6 text-sm">
              Continue to review
            </Button>
          </div>
        </form>

        <aside
          aria-label="Order summary"
          className="flex flex-col gap-3 rounded-lg border p-5 text-sm lg:sticky lg:top-6"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-medium">{subtotalLabel(summary.count)}</h2>
            <p className="text-lg font-semibold tabular-nums">
              {formatPeso(summary.subtotal)}
            </p>
          </div>
          <p className="text-muted-foreground">
            Shipping is calculated in the next step.
          </p>
          <Link href="/cart" className="w-fit underline underline-offset-4">
            Edit cart
          </Link>
        </aside>
      </div>
    </div>
  )
}
