import type { z } from "zod"

import type { SpecGroup } from "./helpers"
import { builderCategories, type BuilderCategorySlug } from "./registry"

// The admin product form's spec controls, derived from each category's Zod
// schema and FieldMeta (docs/specs/045-admin-products-create-edit, R2, R3).
// Nothing here is written per category: adding a spec field is a code change
// to the schema and its metadata (ADR 0002), and the form picks it up. Pure,
// and free of server imports like the rest of lib/specs.

export type SpecFormKind = "integer" | "boolean" | "enum" | "enum-list" | "text"

export type SpecOption = { value: string; label: string }

export type SpecFormField = {
  key: string
  label: string
  unit?: string
  group?: SpecGroup
  kind: SpecFormKind
  // Required in every branch that has the field
  required: boolean
  // For enum and enum-list: the allowed values (as the text a form holds)
  options: SpecOption[]
  // Option values are numbers in the specs (radiator sizes)
  numeric: boolean
  // For a union (the CPU cooler): the discriminator values the field belongs
  // to; null when it belongs to all
  appliesTo: string[] | null
}

export type SpecForm = {
  fields: SpecFormField[]
  // The key that picks the union branch ("type"), or null
  discriminator: string | null
}

// What the form holds for each field: text for numbers and choices, a boolean
// for a checkbox, a list of values for a multi-choice
export type SpecFormValue = string | boolean | string[]
export type SpecFormValues = Record<string, SpecFormValue>

type Shape = Record<string, z.ZodType>
type AnySchema = { def: { type: string } } & z.ZodType

const defType = (schema: z.ZodType): string => (schema as AnySchema).def.type

function unwrapOptional(schema: z.ZodType): {
  inner: z.ZodType
  optional: boolean
} {
  return defType(schema) === "optional"
    ? { inner: (schema as z.ZodOptional).unwrap() as z.ZodType, optional: true }
    : { inner: schema, optional: false }
}

function branchesOf(schema: z.ZodType): {
  discriminator: string | null
  branches: { value: string | null; shape: Shape }[]
} {
  const def = (schema as unknown as { def: Record<string, unknown> }).def
  if (typeof def.discriminator === "string") {
    const key = def.discriminator
    const options = def.options as z.ZodObject[]
    return {
      discriminator: key,
      branches: options.map((option) => {
        const literal = option.shape[key] as unknown as { values: Set<string> }
        return { value: [...literal.values][0], shape: option.shape as Shape }
      }),
    }
  }
  return {
    discriminator: null,
    branches: [{ value: null, shape: (schema as z.ZodObject).shape as Shape }],
  }
}

function valuesOf(schema: z.ZodType): (string | number)[] {
  if (defType(schema) === "enum") return [...(schema as z.ZodEnum).options]
  return [...(schema as unknown as { values: Set<string | number> }).values]
}

function kindOf(schema: z.ZodType): {
  kind: SpecFormKind
  values: (string | number)[]
} {
  switch (defType(schema)) {
    case "number":
      return { kind: "integer", values: [] }
    case "boolean":
      return { kind: "boolean", values: [] }
    case "string":
      return { kind: "text", values: [] }
    case "enum":
    case "literal":
      return { kind: "enum", values: valuesOf(schema) }
    case "array": {
      const element = (schema as unknown as { element: z.ZodType }).element
      const type = defType(element)
      if (type !== "enum" && type !== "literal") {
        throw new Error(`unsupported list element ${type}`)
      }
      return { kind: "enum-list", values: valuesOf(element) }
    }
    default:
      throw new Error(`unsupported spec schema ${defType(schema)}`)
  }
}

const cache = new Map<BuilderCategorySlug, SpecForm>()

export function specFormFields(category: BuilderCategorySlug): SpecForm {
  const cached = cache.get(category)
  if (cached) return cached

  const definition = builderCategories[category]
  const metas = definition.fields as Record<
    string,
    {
      label: string
      unit?: string
      group?: SpecGroup
      options?: Readonly<Record<string, string>>
    }
  >
  const { discriminator, branches } = branchesOf(definition.schema)

  const fields: SpecFormField[] = Object.keys(metas).map((key) => {
    const found: {
      value: string | null
      required: boolean
      kind: SpecFormKind
      values: (string | number)[]
    }[] = []
    for (const branch of branches) {
      const field = branch.shape[key]
      if (!field) continue
      const { inner, optional } = unwrapOptional(field)
      // z.never marks a field of the other branch
      if (defType(inner) === "never") continue
      found.push({ value: branch.value, required: !optional, ...kindOf(inner) })
    }
    if (found.length === 0) throw new Error(`${category}.${key} has no schema`)

    const meta = metas[key]
    const values = [...new Set(found.flatMap((entry) => entry.values))]
    const appliesTo = found.some((entry) => entry.value === null)
      ? null
      : found.length === branches.length
        ? null
        : found.map((entry) => entry.value as string)
    return {
      key,
      label: meta.label,
      unit: meta.unit,
      group: meta.group,
      kind: found[0].kind,
      required: found.every((entry) => entry.required),
      options: values.map((value) => ({
        value: String(value),
        label: meta.options?.[String(value)] ?? String(value),
      })),
      numeric: values.some((value) => typeof value === "number"),
      appliesTo,
    }
  })

  const form = { fields, discriminator }
  cache.set(category, form)
  return form
}

// The fields that show for the values typed so far: all of them, or for a
// union only those of the chosen branch (plus the discriminator itself)
export function visibleSpecFields(
  form: SpecForm,
  values: SpecFormValues
): SpecFormField[] {
  if (!form.discriminator) return form.fields
  const chosen = values[form.discriminator]
  return form.fields.filter(
    (field) =>
      field.appliesTo === null ||
      (typeof chosen === "string" && field.appliesTo.includes(chosen))
  )
}

const WHOLE = /^-?\d{1,15}$/

export type SpecsFromForm = {
  specs: Record<string, unknown>
  // Problems with the text itself (not a whole number, an unknown key); the
  // schema's own rules are validateSpecs's
  errors: Record<string, string>
}

// Turns what the form holds into the object validateSpecs takes. Blank text
// is left out (the schema then says "required" or accepts the absence), a
// value that can't be a number is reported, and a key the category doesn't
// have is reported, so a hand-made request can't smuggle one in.
export function specsFromForm(
  category: BuilderCategorySlug,
  values: SpecFormValues
): SpecsFromForm {
  const form = specFormFields(category)
  const visible = visibleSpecFields(form, values)
  const known = new Set(form.fields.map((field) => field.key))
  const specs: Record<string, unknown> = {}
  const errors: Record<string, string> = {}

  for (const key of Object.keys(values)) {
    if (!known.has(key)) errors[key] = "Not a field of this category."
  }

  for (const field of visible) {
    const raw = values[field.key]
    switch (field.kind) {
      case "boolean":
        specs[field.key] = raw === true
        break
      case "integer": {
        const text = typeof raw === "string" ? raw.trim() : ""
        if (text === "") break
        if (!WHOLE.test(text)) {
          errors[field.key] = "Enter a whole number."
          break
        }
        specs[field.key] = Number(text)
        break
      }
      case "text": {
        const text = typeof raw === "string" ? raw.trim() : ""
        if (text !== "") specs[field.key] = text
        break
      }
      case "enum": {
        const text = typeof raw === "string" ? raw : ""
        if (text !== "") specs[field.key] = field.numeric ? Number(text) : text
        break
      }
      case "enum-list": {
        const list = Array.isArray(raw) ? raw : []
        specs[field.key] = list.map((item) =>
          field.numeric ? Number(item) : item
        )
        break
      }
    }
  }
  return { specs, errors }
}

// The edit form's starting values from stored specs
export function formValuesFromSpecs(
  category: BuilderCategorySlug,
  specs: unknown
): SpecFormValues {
  const stored = (specs ?? {}) as Record<string, unknown>
  const values: SpecFormValues = {}
  for (const field of specFormFields(category).fields) {
    const value = stored[field.key]
    if (value === undefined || value === null) continue
    if (typeof value === "boolean") values[field.key] = value
    else if (Array.isArray(value)) values[field.key] = value.map(String)
    else values[field.key] = String(value)
  }
  return values
}
