import { z } from "zod"
import { describe, expect, test } from "vitest"

import {
  builderCategories,
  type BuilderCategorySlug,
  type FieldMeta,
  type RuleId,
} from "@/lib/specs"

// Spec data coverage for the compatibility rules
// (docs/specs/018-compatibility-rules, "Spec data coverage"): a field a rule
// reads must be required, so admins can't publish a part without it (PRD,
// Implementation notes), and every rule must have its data in each category
// the PRD rules table lists for it.

// The PRD's "Compatibility rules (MVP)" table: the categories whose fields
// each rule reads. "All ↔ PSU" is the categories with a power field; for
// "CPU, no GPU" the GPU counts only by being picked.
const PRD_RULE_CATEGORIES: Record<RuleId, BuilderCategorySlug[]> = {
  "socket-match": ["cpu", "motherboard"],
  "memory-type": ["memory", "motherboard"],
  "memory-slots": ["memory", "motherboard"],
  "memory-capacity": ["memory", "motherboard"],
  "form-factor": ["motherboard", "case"],
  "gpu-length": ["gpu", "case"],
  "cooler-height": ["cpu-cooler", "case"],
  "cooler-socket": ["cpu-cooler", "cpu"],
  "radiator-fit": ["cpu-cooler", "case"],
  "psu-wattage": ["cpu", "gpu", "psu"],
  "psu-form-factor": ["psu", "case"],
  "m2-slots": ["storage", "motherboard"],
  "integrated-graphics": ["cpu"],
  "bios-update": ["cpu", "motherboard"],
}

type Registry = Record<
  BuilderCategorySlug,
  { schema: z.ZodType; fields: Record<string, FieldMeta> }
>

// One object per branch of the cooler union, or the schema itself
const branches = (schema: z.ZodType) =>
  (schema instanceof z.ZodDiscriminatedUnion
    ? schema.options
    : [schema]) as z.ZodObject[]

// A field of the other cooler type (z.never), not a real field of this branch
const isPlaceholder = (field: z.ZodType) =>
  field instanceof z.ZodOptional && field.unwrap() instanceof z.ZodNever

const isOptional = (field: z.ZodType) =>
  field instanceof z.ZodOptional ||
  field instanceof z.ZodNullable ||
  field instanceof z.ZodDefault

function ruleFieldProblems(registry: Registry): string[] {
  const problems = new Set<string>()
  for (const [slug, { schema, fields }] of Object.entries(registry)) {
    for (const [key, { rules }] of Object.entries(fields)) {
      if (!rules?.length) continue
      const name = `${slug}.${key} (${rules.join(", ")})`
      const present = branches(schema)
        .map((branch) => branch.shape[key] as z.ZodType | undefined)
        .filter((field) => field && !isPlaceholder(field))
      if (present.length === 0) problems.add(`${name} is in no schema`)
      if (present.some((field) => isOptional(field!))) {
        problems.add(`${name} is optional`)
      }
    }
  }
  for (const [rule, categories] of Object.entries(PRD_RULE_CATEGORIES)) {
    for (const category of categories) {
      const fields: Record<string, FieldMeta> = registry[category].fields
      const tagged = Object.values(fields).some((meta) =>
        meta.rules?.includes(rule as RuleId)
      )
      if (!tagged) problems.add(`${rule} has no field in ${category}`)
    }
  }
  return [...problems]
}

const registry: Registry = builderCategories

describe("compatibility rule fields", () => {
  test("are required, and every rule has a field in each PRD category", () => {
    expect(ruleFieldProblems(registry)).toEqual([])
  })

  test("fails when a rule field is optional", () => {
    const caseSpecs = builderCategories.case.schema
    const doctored = {
      ...registry,
      case: {
        ...registry.case,
        schema: caseSpecs.extend({
          maxGpuLengthMm: caseSpecs.shape.maxGpuLengthMm.optional(),
        }),
      },
    }
    expect(ruleFieldProblems(doctored)).toEqual([
      "case.maxGpuLengthMm (gpu-length) is optional",
    ])
  })

  // heightMm is required for AIR and a z.never placeholder for AIO; only
  // the branch that has the field counts
  test("checks each cooler branch on its own", () => {
    const [air, aio] = branches(builderCategories["cpu-cooler"].schema)
    const doctored = {
      ...registry,
      "cpu-cooler": {
        ...registry["cpu-cooler"],
        schema: z.discriminatedUnion("type", [
          air.extend({ heightMm: air.shape.heightMm.optional() }),
          aio,
        ]),
      },
    }
    expect(ruleFieldProblems(doctored)).toEqual([
      "cpu-cooler.heightMm (cooler-height) is optional",
    ])
  })

  test("fails when a PRD category has no field for a rule", () => {
    const cpuFields = builderCategories.cpu.fields
    const doctored = {
      ...registry,
      cpu: {
        ...registry.cpu,
        fields: {
          ...cpuFields,
          socket: {
            ...cpuFields.socket,
            rules: ["socket-match", "bios-update"] as const,
          },
        },
      },
    }
    expect(ruleFieldProblems(doctored)).toEqual([
      "cooler-socket has no field in cpu",
    ])
  })
})
