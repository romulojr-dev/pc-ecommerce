"use client"

import { useId, useOptimistic, useState } from "react"

import { useNavigateListing } from "@/components/catalog/listing-shell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { FilterOptions, FilterValues } from "@/lib/listing-filters"
import {
  MAX_PRICE_PESOS,
  parsePriceBound,
  priceFilter,
} from "@/lib/listing-filters/price"
import {
  type ListingState,
  listingHref,
  withFilter,
} from "@/lib/listing-params"

type ListingFiltersProps = {
  slug: string
  state: ListingState
  options: FilterOptions
}

// Typed prices may carry the separators people write: "₱15,000"
const cleanPrice = (text: string) => text.replace(/[\s,₱]/g, "")

// The text of one price field for a bound, "" when there is none
const boundText = (bound: number | null | undefined) =>
  bound === null || bound === undefined ? "" : String(bound)

// A field's problem, or null when it is empty or a valid whole-peso amount
function priceError(text: string): string | null {
  const clean = cleanPrice(text)
  if (clean === "" || parsePriceBound(clean) !== null) return null
  return `Enter whole pesos from 0 to ${MAX_PRICE_PESOS.toLocaleString("en-PH")}.`
}

// The filter sidebar (docs/specs/012-common-filters). Brand and in stock
// apply at once, one decision per click; the price range applies on submit,
// since typing "15000" would otherwise navigate five times with nonsense
// ranges on the way. Every change starts again at page 1 and keeps the sort.
export function ListingFilters({ slug, state, options }: ListingFiltersProps) {
  const navigate = useNavigateListing()
  // The checkboxes show a click at once, while the new results load
  const [filters, setFilters] = useOptimistic<FilterValues>(state.filters)

  function apply<K extends keyof FilterValues>(
    key: K,
    value: FilterValues[K] | null
  ) {
    const next = withFilter(state, key, value)
    navigate(listingHref(slug, next), () => setFilters(next.filters))
  }

  const brands = options.brand ?? []
  const selectedBrands = filters.brand ?? []

  function toggleBrand(slugToToggle: string, checked: boolean) {
    const next = checked
      ? [...selectedBrands, slugToToggle]
      : selectedBrands.filter((brand) => brand !== slugToToggle)
    // Sorted, as the URL writes them, so there is no redirect to tidy up
    apply("brand", next.length > 0 ? next.toSorted() : null)
  }

  return (
    <aside aria-label="Filters" className="flex flex-col gap-6">
      {brands.length > 0 && (
        <FieldSet>
          <FieldLegend variant="label">Brand</FieldLegend>
          <FieldGroup data-slot="checkbox-group" className="gap-2">
            {brands.map((brand) => (
              <CheckboxField
                key={brand.value}
                label={brand.label}
                checked={selectedBrands.includes(brand.value)}
                onCheckedChange={(checked) => toggleBrand(brand.value, checked)}
              />
            ))}
          </FieldGroup>
        </FieldSet>
      )}

      <PriceForm
        price={state.filters.price}
        onApply={(price) => apply("price", price)}
      />

      <FieldSet>
        <FieldLegend variant="label">Availability</FieldLegend>
        <FieldGroup data-slot="checkbox-group" className="gap-2">
          <CheckboxField
            label="In stock only"
            checked={filters.inStock === true}
            onCheckedChange={(checked) => apply("inStock", checked || null)}
          />
        </FieldGroup>
      </FieldSet>
    </aside>
  )
}

function CheckboxField({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const id = useId()
  const labelId = `${id}-label`
  return (
    <Field orientation="horizontal">
      {/* Base UI only links the label to the checkbox once the page has
          hydrated, and `htmlFor` points at its hidden input; the explicit
          aria-labelledby names the checkbox in the server-rendered HTML too */}
      <Checkbox
        id={id}
        aria-labelledby={labelId}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
      <FieldLabel id={labelId} htmlFor={id} className="font-normal">
        {label}
      </FieldLabel>
    </Field>
  )
}

type PriceFormProps = {
  price: FilterValues["price"]
  onApply: (price: FilterValues["price"] | null) => void
}

function PriceForm({ price, onApply }: PriceFormProps) {
  const id = useId()
  const [min, setMin] = useState(boundText(price?.min))
  const [max, setMax] = useState(boundText(price?.max))
  // Shown after a submit, so nothing complains while someone is still typing
  const [errors, setErrors] = useState<{
    min: string | null
    max: string | null
  }>({ min: null, max: null })

  // When the URL's range changes (an Apply, a chip removed, a bad bound
  // dropped), show what is applied. Done while rendering, not by remounting
  // the form, so the focus stays where it is.
  const applied = JSON.stringify(price ?? null)
  const [shown, setShown] = useState(applied)
  if (applied !== shown) {
    setShown(applied)
    setMin(boundText(price?.min))
    setMax(boundText(price?.max))
    setErrors({ min: null, max: null })
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const next = { min: priceError(min), max: priceError(max) }
    setErrors(next)
    if (next.min || next.max) return

    // Both fields empty clears the range; the parser also swaps min > max
    onApply(
      priceFilter.parse({
        minPrice: cleanPrice(min),
        maxPrice: cleanPrice(max),
      })
    )
  }

  const fields = [
    { name: "min", label: "Min", value: min, set: setMin },
    { name: "max", label: "Max", value: max, set: setMax },
  ] as const

  return (
    <form onSubmit={submit} noValidate aria-label="Price range">
      <FieldSet>
        <FieldLegend variant="label">Price (₱)</FieldLegend>
        <div className="grid grid-cols-2 gap-2">
          {fields.map(({ name, label, value, set }) => (
            <Field key={name} data-invalid={errors[name] !== null}>
              <FieldLabel htmlFor={`${id}-${name}`} className="font-normal">
                {label}
                <span className="sr-only"> price (₱)</span>
              </FieldLabel>
              <Input
                id={`${id}-${name}`}
                inputMode="numeric"
                autoComplete="off"
                placeholder={label}
                value={value}
                onChange={(event) => set(event.target.value)}
                aria-invalid={errors[name] !== null}
                aria-describedby={
                  errors[name] ? `${id}-${name}-error` : undefined
                }
              />
            </Field>
          ))}
        </div>
        {(["min", "max"] as const).map(
          (name) =>
            errors[name] && (
              <FieldError key={name} id={`${id}-${name}-error`}>
                {name === "min" ? "Min" : "Max"}: {errors[name]}
              </FieldError>
            )
        )}
        <Button type="submit" variant="outline" size="sm">
          Apply
        </Button>
      </FieldSet>
    </form>
  )
}
