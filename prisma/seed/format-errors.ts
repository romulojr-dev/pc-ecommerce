import type { z } from "zod"

// Turns seed validation errors into the messages from spec.md ("Validation
// (all-or-nothing)"). Zod's default wording is written for developers; this
// maps issue codes, not message strings, so Zod wording changes don't leak in.

export type SeedError = {
  file: string
  // Position in the file's array, starting at 0
  index: number
  // Taken from the raw part when they are strings, to identify it in output
  name?: string
  sku?: string
  path: PropertyKey[]
  message: string
}

type Problem = { path: PropertyKey[]; message: string }

function describeValue(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value
}

// One Zod issue becomes one or more problems (unrecognized_keys lists several
// keys; each is reported at its own path)
export function describeIssue(issue: z.core.$ZodIssue): Problem[] {
  const missing = issue.input === undefined && issue.path.length > 0
  switch (issue.code) {
    case "invalid_type":
      // z.never() fields carry their own message, e.g. a cooler field that
      // belongs to the other cooler type
      if (issue.expected === "never") {
        return [{ path: issue.path, message: issue.message }]
      }
      if (missing) return [{ path: issue.path, message: "required" }]
      if (issue.expected === "int" && typeof issue.input === "number") {
        return [
          {
            path: issue.path,
            message: `expected integer, received ${issue.input}`,
          },
        ]
      }
      return [
        {
          path: issue.path,
          message: `expected ${issue.expected}, received ${describeValue(issue.input)}`,
        },
      ]
    case "invalid_value":
      if (missing) return [{ path: issue.path, message: "required" }]
      return [
        {
          path: issue.path,
          message: `expected one of ${issue.values.map(String).join(", ")}`,
        },
      ]
    case "invalid_union":
      // A cooler with a missing or unknown `type`
      if (missing) return [{ path: issue.path, message: "required" }]
      return [{ path: issue.path, message: issue.message }]
    case "unrecognized_keys":
      return issue.keys.map((key) => ({
        path: [...issue.path, key],
        message: "unrecognized key",
      }))
    case "too_small":
      return [
        {
          path: issue.path,
          message:
            issue.origin === "array"
              ? issue.message
              : `must be ${issue.inclusive ? "at least" : "greater than"} ${issue.minimum}`,
        },
      ]
    case "too_big":
      return [
        {
          path: issue.path,
          message: `must be ${issue.inclusive ? "at most" : "less than"} ${issue.maximum}`,
        },
      ]
    case "invalid_format":
      return [
        {
          path: issue.path,
          message:
            issue.format === "url" ? "must be a valid URL" : issue.message,
        },
      ]
    default:
      // custom: our own .check() and z.never() messages
      return [{ path: issue.path, message: issue.message }]
  }
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

function partHeader(error: SeedError) {
  const parts = [`${error.file} › #${error.index + 1}`]
  if (error.name) parts.push(`"${error.name}"`)
  if (error.sku) parts.push(`(sku ${error.sku})`)
  return parts.join(" ")
}

// The full report, grouped per part in file order
export function formatErrors(errors: SeedError[]): string {
  const groups = new Map<string, SeedError[]>()
  for (const error of errors) {
    const key = `${error.file}#${error.index}`
    groups.set(key, [...(groups.get(key) ?? []), error])
  }

  const lines = [
    `Seed failed: ${plural(errors.length, "problem")} in ${plural(groups.size, "part")}. Nothing was written.`,
  ]
  for (const group of groups.values()) {
    lines.push("", partHeader(group[0]))
    for (const error of group) {
      const path = error.path.map(String).join(".") || "(part)"
      lines.push(`  ${path}: ${error.message}`)
    }
  }
  return lines.join("\n")
}
