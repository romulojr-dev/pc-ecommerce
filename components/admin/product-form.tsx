"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useId, useRef, useState } from "react"

import {
  createProductAction,
  updateProductAction,
} from "@/app/admin/(shell)/products/actions"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { BuilderCategorySlug } from "@/lib/specs"
import { builderCategories } from "@/lib/specs"
import {
  type SpecFormField,
  type SpecFormValues,
  specFormFields,
  visibleSpecFields,
} from "@/lib/specs/form-fields"
import { errorItems } from "@/lib/admin/product-form"
import type { FieldErrors, ProductFormInput } from "@/lib/admin/product-input"
import { PRODUCT_COPY } from "@/lib/admin/products-copy"
import { slugify } from "@/lib/slug"
import { cn, focusRing } from "@/lib/utils"

// The product form, for create and edit (docs/specs/045-admin-products-create-
// edit, B9–B18). The server decides (the action runs the same rules plus
// validateSpecs); this component only shows what it answers. The spec controls
// are generated from the category's schema and metadata, never written per
// category.

const COPY = PRODUCT_COPY.form
const controlClass =
  "h-7 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 text-xs/relaxed outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60 dark:bg-input/30"

export type BrandOption = { id: string; name: string }

type Props = {
  mode: "create" | "edit"
  initial: ProductFormInput
  brands: BrandOption[]
  // Edit only
  productId?: string
  status?: "DRAFT" | "ACTIVE"
  editVersion?: number
  stock?: number
  // The role may not write (Demo): every control is disabled
  readOnly: boolean
  // A line to show on arrival ("Draft saved.")
  notice?: string | null
}

export function ProductForm({
  mode,
  initial,
  brands,
  productId,
  status = "DRAFT",
  editVersion = 0,
  stock = 0,
  readOnly,
  notice = null,
}: Props) {
  const router = useRouter()
  const formId = useId()
  const summary = useRef<HTMLDivElement>(null)
  const [values, setValues] = useState(initial)
  const version = editVersion
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<string | null>(notice)
  const [stale, setStale] = useState(false)
  const [pending, setPending] = useState(false)
  const [slugTouched, setSlugTouched] = useState(mode === "edit")
  const [categoryNote, setCategoryNote] = useState(false)

  const locked = mode === "edit" && status !== "DRAFT"
  const categorySlug = values.categorySlug as BuilderCategorySlug
  const form = specFormFields(categorySlug)
  const visible = visibleSpecFields(form, values.specs)
  const items = errorItems(errors, values.categorySlug)

  function set<K extends keyof ProductFormInput>(
    key: K,
    value: ProductFormInput[K]
  ) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function setSpec(key: string, value: string | boolean | string[]) {
    setValues((current) => {
      const specs: SpecFormValues = { ...current.specs, [key]: value }
      return { ...current, specs }
    })
  }

  function changeCategory(next: string) {
    if (next === values.categorySlug) return
    // The new category's fields start empty (D3)
    setValues((current) => ({ ...current, categorySlug: next, specs: {} }))
    setCategoryNote(true)
    setErrors((current) => {
      const kept: FieldErrors = {}
      for (const [key, text] of Object.entries(current)) {
        if (!key.startsWith("specs")) kept[key] = text
      }
      return kept
    })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (readOnly || pending) return
    setPending(true)
    setMessage(null)
    setStale(false)
    try {
      const answer =
        mode === "create"
          ? await createProductAction(values)
          : await updateProductAction({
              ...values,
              id: productId!,
              expectedVersion: version,
            })
      if (!answer.ok) {
        setErrors({})
        setMessage(answer.message)
        return
      }
      const result = answer.data
      switch (result.kind) {
        case "saved":
          setErrors({})
          // The edit page re-renders with the new edit version (the form
          // remounts keyed by it) and shows the line from the URL
          router.replace(
            `/admin/products/${result.id}?saved=${mode === "create" ? "draft" : "changes"}`
          )
          break
        case "invalid":
          setErrors(result.errors)
          requestAnimationFrame(() => summary.current?.focus())
          break
        case "stale":
          setStale(true)
          break
        case "unchanged":
          setMessage(COPY.noChanges)
          break
        default:
          setMessage(COPY.failed)
      }
    } catch {
      setMessage(COPY.failed)
    } finally {
      setPending(false)
    }
  }

  const fieldError = (key: string) => errors[key]
  const describedBy = (key: string, extra?: string) =>
    [errors[key] ? `${formId}-err-${key}` : null, extra]
      .filter(Boolean)
      .join(" ") || undefined

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex max-w-4xl flex-col gap-6"
      aria-describedby={readOnly ? `${formId}-readonly` : undefined}
    >
      {readOnly ? (
        <p id={`${formId}-readonly`} className="rounded-md border p-3 text-sm">
          {COPY.readOnly}
        </p>
      ) : null}

      <div
        ref={summary}
        tabIndex={-1}
        className="outline-none"
        aria-live="polite"
      >
        {items.length > 0 ? (
          <div
            role="alert"
            className="rounded-md border border-destructive p-3"
          >
            <p className="font-medium">{COPY.summary(items.length)}</p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {items.map((item) => (
                <li key={item.key}>
                  <a
                    href={`#${formId}-${item.key}`}
                    className={cn("underline underline-offset-4", focusRing)}
                  >
                    {item.label}
                  </a>
                  : {item.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {stale ? (
          <div
            role="alert"
            className="rounded-md border border-destructive p-3"
          >
            <p>{COPY.stale}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => router.refresh()}
            >
              {COPY.reload}
            </Button>
          </div>
        ) : null}
        {message ? <p className="text-sm">{message}</p> : null}
      </div>

      <fieldset disabled={readOnly} className="flex flex-col gap-6">
        <Section title={COPY.sections.basics}>
          <TextField
            id={`${formId}-name`}
            label={COPY.labels.name}
            value={values.name}
            error={fieldError("name")}
            errorId={`${formId}-err-name`}
            required
            onChange={(value) => {
              set("name", value)
              if (!slugTouched) set("slug", slugify(value))
            }}
          />
          <TextField
            id={`${formId}-sku`}
            label={COPY.labels.sku}
            value={values.sku}
            error={fieldError("sku")}
            errorId={`${formId}-err-sku`}
            required
            lockedText={locked ? COPY.locked : undefined}
            onChange={(value) => set("sku", value)}
          />
          <TextField
            id={`${formId}-slug`}
            label={COPY.labels.slug}
            value={values.slug}
            error={fieldError("slug")}
            errorId={`${formId}-err-slug`}
            required
            lockedText={locked ? COPY.locked : undefined}
            onChange={(value) => {
              setSlugTouched(true)
              set("slug", value)
            }}
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${formId}-categorySlug`}>
              {COPY.labels.category} <Required />
            </Label>
            {mode === "create" || locked ? (
              <p id={`${formId}-categorySlug`} className="text-sm">
                {builderCategories[categorySlug]?.name ?? values.categorySlug}
                {mode === "create" ? (
                  <>
                    {" "}
                    <Link
                      href="/admin/products/new"
                      className={cn("underline underline-offset-4", focusRing)}
                    >
                      {COPY.changeCategory}
                    </Link>
                  </>
                ) : (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {COPY.locked}
                  </span>
                )}
              </p>
            ) : (
              <select
                id={`${formId}-categorySlug`}
                className={controlClass}
                value={values.categorySlug}
                aria-describedby={describedBy("categorySlug")}
                onChange={(event) => changeCategory(event.target.value)}
              >
                {Object.entries(builderCategories).map(([slug, { name }]) => (
                  <option key={slug} value={slug}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            {categoryNote ? (
              <p className="text-xs text-muted-foreground">
                {COPY.categoryChangeNote}
              </p>
            ) : null}
            <FieldError
              id={`${formId}-err-categorySlug`}
              text={fieldError("categorySlug")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${formId}-brandId`}>
              {COPY.labels.brand} <Required />
            </Label>
            <select
              id={`${formId}-brandId`}
              className={controlClass}
              value={values.brandId}
              aria-invalid={Boolean(errors.brandId)}
              aria-describedby={describedBy("brandId")}
              onChange={(event) => set("brandId", event.target.value)}
            >
              <option value="">{COPY.chooseBrand}</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
            <FieldError
              id={`${formId}-err-brandId`}
              text={fieldError("brandId")}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.featured}
              onChange={(event) => set("featured", event.target.checked)}
            />
            {COPY.labels.featured}
            <span className="text-xs text-muted-foreground">
              {COPY.hints.featured}
            </span>
          </label>
        </Section>

        <Section title={COPY.sections.pricing}>
          <TextField
            id={`${formId}-price`}
            label={COPY.labels.price}
            value={values.price}
            error={fieldError("price")}
            errorId={`${formId}-err-price`}
            required
            inputMode="decimal"
            onChange={(value) => set("price", value)}
          />
          <TextField
            id={`${formId}-salePrice`}
            label={COPY.labels.salePrice}
            value={values.salePrice}
            error={fieldError("salePrice")}
            errorId={`${formId}-err-salePrice`}
            inputMode="decimal"
            hint={COPY.hints.salePrice}
            onChange={(value) => set("salePrice", value)}
          />
        </Section>

        <Section title={COPY.sections.details}>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${formId}-description`}>
              {COPY.labels.description}
            </Label>
            <textarea
              id={`${formId}-description`}
              rows={4}
              className={cn(controlClass, "h-auto py-1")}
              value={values.description}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={describedBy("description")}
              onChange={(event) => set("description", event.target.value)}
            />
            <FieldError
              id={`${formId}-err-description`}
              text={fieldError("description")}
            />
          </div>
          <TextField
            id={`${formId}-weightGrams`}
            label={COPY.labels.weightGrams}
            value={values.weightGrams}
            error={fieldError("weightGrams")}
            errorId={`${formId}-err-weightGrams`}
            required
            inputMode="numeric"
            onChange={(value) => set("weightGrams", value)}
          />
          <TextField
            id={`${formId}-warrantyMonths`}
            label={COPY.labels.warrantyMonths}
            value={values.warrantyMonths}
            error={fieldError("warrantyMonths")}
            errorId={`${formId}-err-warrantyMonths`}
            required
            inputMode="numeric"
            onChange={(value) => set("warrantyMonths", value)}
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${formId}-boxContents`}>
              {COPY.labels.boxContents}
            </Label>
            <textarea
              id={`${formId}-boxContents`}
              rows={3}
              className={cn(controlClass, "h-auto py-1")}
              value={values.boxContents}
              aria-invalid={Boolean(errors.boxContents)}
              aria-describedby={describedBy(
                "boxContents",
                `${formId}-box-hint`
              )}
              onChange={(event) => set("boxContents", event.target.value)}
            />
            <p
              id={`${formId}-box-hint`}
              className="text-xs text-muted-foreground"
            >
              {COPY.hints.boxContents}
            </p>
            <FieldError
              id={`${formId}-err-boxContents`}
              text={fieldError("boxContents")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${formId}-preorderShipsOn`}>
              {COPY.labels.preorderShipsOn}
            </Label>
            <Input
              id={`${formId}-preorderShipsOn`}
              type="date"
              value={values.preorderShipsOn}
              aria-invalid={Boolean(errors.preorderShipsOn)}
              aria-describedby={describedBy("preorderShipsOn")}
              onChange={(event) => set("preorderShipsOn", event.target.value)}
            />
            <FieldError
              id={`${formId}-err-preorderShipsOn`}
              text={fieldError("preorderShipsOn")}
            />
          </div>
          <p className="text-sm text-muted-foreground">{COPY.stock(stock)}</p>
        </Section>

        <Section title={COPY.sections.specs}>
          {errors.specs ? (
            <p
              role="alert"
              id={`${formId}-err-specs`}
              className="text-sm text-destructive"
            >
              {errors.specs}
            </p>
          ) : null}
          {visible.map((field) => (
            <SpecControl
              key={`${values.categorySlug}-${field.key}`}
              id={`${formId}-specs.${field.key}`}
              errorId={`${formId}-err-specs.${field.key}`}
              field={field}
              value={values.specs[field.key]}
              error={errors[`specs.${field.key}`]}
              onChange={(value) => setSpec(field.key, value)}
            />
          ))}
        </Section>
      </fieldset>

      {readOnly ? null : (
        <div className="sticky bottom-0 flex items-center gap-3 border-t bg-background py-3">
          <Button type="submit" disabled={pending}>
            {pending
              ? COPY.saving
              : status === "DRAFT"
                ? COPY.saveDraft
                : COPY.saveChanges}
          </Button>
          <Link
            href="/admin/products"
            className={cn(buttonVariants({ variant: "ghost" }), focusRing)}
          >
            {PRODUCT_COPY.heading}
          </Link>
        </div>
      )}
    </form>
  )
}

function Required() {
  return (
    <span className="text-destructive">
      <span aria-hidden="true">*</span>
      <span className="sr-only"> {COPY.required}</span>
    </span>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  )
}

function FieldError({ id, text }: { id: string; text?: string }) {
  return text ? (
    <p id={id} className="text-xs text-destructive">
      {text}
    </p>
  ) : null
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  errorId,
  required,
  hint,
  inputMode,
  lockedText,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  errorId: string
  required?: boolean
  hint?: string
  inputMode?: "decimal" | "numeric"
  lockedText?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>
        {label} {required ? <Required /> : null}
      </Label>
      {lockedText ? (
        <p id={id} className="text-sm">
          {value}
          <span className="ml-2 text-xs text-muted-foreground">
            {lockedText}
          </span>
        </p>
      ) : (
        <Input
          id={id}
          value={value}
          inputMode={inputMode}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <FieldError id={errorId} text={error} />
    </div>
  )
}

// One generated spec control (R2): its kind decides the element
function SpecControl({
  id,
  errorId,
  field,
  value,
  error,
  onChange,
}: {
  id: string
  errorId: string
  field: SpecFormField
  value: string | boolean | string[] | undefined
  error?: string
  onChange: (value: string | boolean | string[]) => void
}) {
  const label = (
    <>
      {field.label}
      {field.unit ? ` (${field.unit})` : ""}{" "}
      {field.required ? <Required /> : null}
    </>
  )
  const described = error ? errorId : undefined

  if (field.kind === "boolean") {
    return (
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            aria-describedby={described}
            onChange={(event) => onChange(event.target.checked)}
          />
          {label}
        </label>
        <FieldError id={errorId} text={error} />
      </div>
    )
  }

  if (field.kind === "enum-list") {
    const chosen = Array.isArray(value) ? value : []
    return (
      <fieldset
        id={id}
        className="flex flex-col gap-1 md:col-span-2"
        aria-describedby={described}
      >
        <legend className="mb-1 text-xs/relaxed font-medium">{label}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {field.options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={chosen.includes(option.value)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...chosen, option.value]
                      : chosen.filter((item) => item !== option.value)
                  )
                }
              />
              {option.label}
            </label>
          ))}
        </div>
        <FieldError id={errorId} text={error} />
      </fieldset>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {field.kind === "enum" ? (
        <select
          id={id}
          className={controlClass}
          value={typeof value === "string" ? value : ""}
          aria-invalid={Boolean(error)}
          aria-describedby={described}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value=""></option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={id}
          value={typeof value === "string" ? value : ""}
          inputMode={field.kind === "integer" ? "numeric" : undefined}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={described}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <FieldError id={errorId} text={error} />
    </div>
  )
}
