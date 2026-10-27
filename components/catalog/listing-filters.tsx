"use client"

import { ChevronDownIcon } from "lucide-react"
import { useId, useOptimistic, useState } from "react"

import { useNavigateListing } from "@/components/catalog/listing-shell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  type FilterKey,
  type FilterOption,
  type FilterOptions,
  type FilterValues,
  type ListingFilter,
} from "@/lib/listing-filters"
import {
  MAX_PRICE_PESOS,
  parsePriceBound,
  priceFilter,
} from "@/lib/listing-filters/price"
import {
  parseSpecBound,
  type SpecRangeFilterValue,
  specParamKeys,
} from "@/lib/listing-filters/spec"
import {
  filtersFor,
  type ListingState,
  type ListingTarget,
  listingHref,
  withFilter,
} from "@/lib/listing-params"
import { cn, focusRing } from "@/lib/utils"

type ListingFiltersProps = {
  target: ListingTarget
  state: ListingState
  options: FilterOptions
}

type Range = { min: number | null; max: number | null }

// The filter sidebar (docs/specs/012-common-filters, docs/specs/013-spec-
// filters): category on search results (docs/specs/014-search), brand, price
// and availability, then a category's spec filters
// in metadata order, each in a section that can be collapsed. Checkboxes
// apply at once, one decision per click; ranges apply on submit, since typing
// "15000" would otherwise navigate five times with nonsense ranges on the
// way. Every change starts again at page 1 and keeps the sort.
export function ListingFilters({
  target,
  state,
  options,
}: ListingFiltersProps) {
  const navigate = useNavigateListing()
  // The checkboxes show a click at once, while the new results load
  const [filters, setFilters] = useOptimistic<FilterValues>(state.filters)

  function apply<K extends FilterKey>(key: K, value: FilterValues[K] | null) {
    const next = withFilter(state, key, value)
    navigate(listingHref(target, next), () => setFilters(next.filters))
  }

  // A checkbox of a multi-value filter (brand, enum, values, contains). The
  // filter's own parser puts the values in URL order, so there is no
  // redirect to tidy up.
  function toggle(
    filter: ListingFilter<unknown>,
    value: string,
    checked: boolean
  ) {
    const selected = (filters[filter.key] as string[] | undefined) ?? []
    const next = checked
      ? [...selected, value]
      : selected.filter((other) => other !== value)
    apply(filter.key, filter.parse({ [filter.key]: next }))
  }

  const list = filtersFor(target)
  const brand = list.find((filter) => filter.key === "brand")!
  // Search results only (docs/specs/014-search)
  const category = list.find((filter) => filter.key === "category")
  const specFilters = list.filter((filter) => filter.spec)

  return (
    <aside aria-label="Filters" className="flex flex-col gap-4">
      {category && (
        <CheckboxSection
          title="Category"
          options={options.category ?? []}
          selected={filters.category ?? []}
          onToggle={(value, checked) => toggle(category, value, checked)}
        />
      )}

      <CheckboxSection
        title="Brand"
        options={options.brand ?? []}
        selected={filters.brand ?? []}
        onToggle={(value, checked) => toggle(brand, value, checked)}
      />

      <FilterSection title="Price (₱)">
        <RangeForm
          name="Price"
          unit="₱"
          range={state.filters.price}
          keys={["minPrice", "maxPrice"]}
          parse={(raw) => priceFilter.parse(raw)}
          // Typed prices may carry the separators people write: "₱15,000"
          clean={(text) => text.replace(/[\s,₱]/g, "")}
          isValid={(text) => parsePriceBound(text) !== null}
          error={`Enter whole pesos from 0 to ${MAX_PRICE_PESOS.toLocaleString("en-PH")}.`}
          onApply={(price) => apply("price", price)}
        />
      </FilterSection>

      <FilterSection title="Availability">
        <CheckboxField
          label="In stock only"
          checked={filters.inStock === true}
          onCheckedChange={(checked) => apply("inStock", checked || null)}
        />
      </FilterSection>

      {specFilters.map((filter) => {
        const { field, meta, kind } = filter.spec!
        const fieldOptions = options[field] ?? []

        if (kind === "range") {
          // No product in the category has the field: nothing to filter
          if (fieldOptions.length === 0) return null
          const title = meta.unit ? `${meta.label} (${meta.unit})` : meta.label
          const [minKey, maxKey] = specParamKeys(field, kind)
          return (
            <FilterSection key={field} title={title}>
              <RangeForm
                name={meta.label}
                unit={meta.unit}
                range={state.filters[field] as SpecRangeFilterValue | undefined}
                keys={[minKey, maxKey]}
                parse={(raw) => filter.parse(raw) as Range | null}
                clean={(text) => text.replace(/[\s,]/g, "")}
                isValid={(text) => parseSpecBound(text) !== null}
                error="Enter a whole number."
                // The category's lowest and highest value
                placeholders={[
                  fieldOptions[0].value,
                  fieldOptions[fieldOptions.length - 1].value,
                ]}
                onApply={(range) => apply(field, range)}
              />
            </FilterSection>
          )
        }

        if (kind === "boolean") {
          const option = fieldOptions[0]
          if (!option) return null
          const checked = filters[field] === true
          return (
            <FilterSection key={field} title={meta.label}>
              <CheckboxField
                label={meta.label}
                count={option.count}
                disabled={option.count === 0 && !checked}
                checked={checked}
                onCheckedChange={(on) => apply(field, on || null)}
              />
            </FilterSection>
          )
        }

        return (
          <CheckboxSection
            key={field}
            title={meta.label}
            options={fieldOptions}
            selected={(filters[field] as string[] | undefined) ?? []}
            onToggle={(value, checked) => toggle(filter, value, checked)}
          />
        )
      })}
    </aside>
  )
}

// A titled group of filters that can be collapsed. Every section starts open,
// so an active filter is never hidden on arrival.
function FilterSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Collapsible defaultOpen className="border-b pb-4 last:border-b-0">
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center justify-between rounded-sm py-1 text-left text-xs/relaxed font-medium",
          focusRing
        )}
      >
        {title}
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <FieldSet>
          <FieldLegend className="sr-only">{title}</FieldLegend>
          {children}
        </FieldSet>
      </CollapsibleContent>
    </Collapsible>
  )
}

// One checkbox per option with its count. An option no product matches with
// the other filters is disabled, unless it is checked, so it can always be
// unchecked (docs/specs/013-spec-filters, "Option counts").
function CheckboxSection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string
  options: FilterOption[]
  selected: string[]
  onToggle: (value: string, checked: boolean) => void
}) {
  // The category has none of these values: nothing to filter
  if (options.length === 0) return null
  return (
    <FilterSection title={title}>
      <FieldGroup data-slot="checkbox-group" className="gap-2">
        {options.map((option) => {
          const checked = selected.includes(option.value)
          return (
            <CheckboxField
              key={option.value}
              label={option.label}
              count={option.count}
              disabled={option.count === 0 && !checked}
              checked={checked}
              onCheckedChange={(on) => onToggle(option.value, on)}
            />
          )
        })}
      </FieldGroup>
    </FilterSection>
  )
}

function CheckboxField({
  label,
  count,
  disabled = false,
  checked,
  onCheckedChange,
}: {
  label: string
  count?: number
  disabled?: boolean
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const id = useId()
  const labelId = `${id}-label`
  const countId = `${id}-count`
  return (
    <Field orientation="horizontal" data-disabled={disabled}>
      {/* Base UI only links the label to the checkbox once the page has
          hydrated, and `htmlFor` points at its hidden input; the explicit
          aria-labelledby names the checkbox in the server-rendered HTML too.
          The count is its description, so its name stays the label. */}
      <Checkbox
        id={id}
        aria-labelledby={labelId}
        aria-describedby={count === undefined ? undefined : countId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
      <FieldLabel id={labelId} htmlFor={id} className="font-normal">
        {label}
      </FieldLabel>
      {count !== undefined && (
        <span id={countId} className="text-xs text-muted-foreground">
          <span aria-hidden="true">({count})</span>
          {/* One string: separate text nodes lose the space in the description */}
          <span className="sr-only">{`${count} ${count === 1 ? "product" : "products"}`}</span>
        </span>
      )}
    </Field>
  )
}

// The text of one range field for a bound, "" when there is none
const boundText = (bound: number | null | undefined) =>
  bound === null || bound === undefined ? "" : String(bound)

type RangeFormProps = {
  // Names the form and its fields: "Price" -> "Min price (₱)"
  name: string
  unit?: string
  range: Range | undefined
  // The filter's URL keys for the min and max bounds
  keys: [string, string]
  // The filter's own parser: drops empty bounds and swaps min > max
  parse: (raw: Record<string, string>) => Range | null
  clean: (text: string) => string
  isValid: (clean: string) => boolean
  error: string
  placeholders?: [string, string]
  onApply: (range: Range | null) => void
}

// Min and max fields with an Apply button, for price and spec ranges
function RangeForm({
  name,
  unit,
  range,
  keys,
  parse,
  clean,
  isValid,
  error,
  placeholders,
  onApply,
}: RangeFormProps) {
  const id = useId()
  const [min, setMin] = useState(boundText(range?.min))
  const [max, setMax] = useState(boundText(range?.max))
  // Shown after a submit, so nothing complains while someone is still typing
  const [errors, setErrors] = useState<{
    min: string | null
    max: string | null
  }>({ min: null, max: null })

  // When the URL's range changes (an Apply, a chip removed, a bad bound
  // dropped), show what is applied. Done while rendering, not by remounting
  // the form, so the focus stays where it is.
  const applied = JSON.stringify(range ?? null)
  const [shown, setShown] = useState(applied)
  if (applied !== shown) {
    setShown(applied)
    setMin(boundText(range?.min))
    setMax(boundText(range?.max))
    setErrors({ min: null, max: null })
  }

  // A field's problem, or null when it is empty or valid
  const problem = (text: string) => {
    const cleaned = clean(text)
    return cleaned === "" || isValid(cleaned) ? null : error
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const next = { min: problem(min), max: problem(max) }
    setErrors(next)
    if (next.min || next.max) return
    // Both fields empty clears the range; the parser also swaps min > max
    onApply(parse({ [keys[0]]: clean(min), [keys[1]]: clean(max) }))
  }

  // "Min price (₱)", "Max VRAM (GB)": the name in lower case, acronyms kept
  const lowerName = name
    .split(" ")
    .map((word) => (/^[A-Z0-9-]+$/.test(word) ? word : word.toLowerCase()))
    .join(" ")
  const suffix = ` ${lowerName}${unit ? ` (${unit})` : ""}`
  const fields = [
    { bound: "min", label: "Min", value: min, set: setMin },
    { bound: "max", label: "Max", value: max, set: setMax },
  ] as const

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={`${name} range`}
      className="flex flex-col gap-2"
    >
      <div className="grid grid-cols-2 gap-2">
        {fields.map(({ bound, label, value, set }, index) => (
          <Field key={bound} data-invalid={errors[bound] !== null}>
            <FieldLabel htmlFor={`${id}-${bound}`} className="font-normal">
              {label}
              <span className="sr-only">{suffix}</span>
            </FieldLabel>
            <Input
              id={`${id}-${bound}`}
              inputMode="numeric"
              autoComplete="off"
              placeholder={placeholders?.[index] ?? label}
              value={value}
              onChange={(event) => set(event.target.value)}
              aria-invalid={errors[bound] !== null}
              aria-describedby={
                errors[bound] ? `${id}-${bound}-error` : undefined
              }
            />
          </Field>
        ))}
      </div>
      {fields.map(
        ({ bound, label }) =>
          errors[bound] && (
            <FieldError key={bound} id={`${id}-${bound}-error`}>
              {label}: {errors[bound]}
            </FieldError>
          )
      )}
      <Button type="submit" variant="outline" size="sm">
        Apply
      </Button>
    </form>
  )
}
