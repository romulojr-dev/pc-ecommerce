import { formatDate, formatPeso } from "@/lib/format"
import { cancelReasonLabel } from "@/lib/orders/cancel"
import { dateTimeText } from "@/lib/orders/time"
import { type OrderStatusName, statusLabel } from "@/lib/orders/timeline"

import { isSecretKey, REDACTED } from "./audit-data"
import { auditDiff, type Leaf } from "./audit-diff"
import { effectiveDemo, effectiveFormat, type MaskKind } from "./audit-keys"
import { fieldLabel, humanize } from "./audit-labels"
import { INVENTORY_COPY } from "./inventory-copy"
import { HIDDEN_IN_DEMO, maskByKind } from "./mask"
import { ORDER_STATUSES } from "./orders-params"
import type { AdminRole } from "./permissions"

// An entry's changes as text, ready to print
// (docs/specs/047-admin-audit-log-view, Behavior 9 to 12, R6 to R8). The diff
// runs on the RAW values; the Demo rule is applied to each side afterwards,
// so the text a Demo viewer receives is never the real value, and two
// different real values that mask to the same text still count as a change.
// Pure.

export const EMPTY_VALUE = "—"
export const MAX_VALUE_CHARS = 300

export type ChangeRow = {
  path: string
  label: string
  before: string
  after: string
  // Demo only: the two sides read the same after masking (E18)
  looksUnchanged: boolean
}

function statusText(path: string, value: string): string {
  const leaf = path.split(".").pop()!.toLowerCase()
  if (leaf === "cancelreason") {
    return cancelReasonLabel(value) ?? humanize(value)
  }
  if (leaf === "reason" && Object.hasOwn(INVENTORY_COPY.reasons, value)) {
    return INVENTORY_COPY.reasons[value]
  }
  if ((ORDER_STATUSES as readonly string[]).includes(value)) {
    return statusLabel(value as OrderStatusName)
  }
  return humanize(value)
}

function plainText(value: Leaf): string {
  if (value === null || value === undefined) return EMPTY_VALUE
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (Array.isArray(value)) {
    return value.length === 0
      ? EMPTY_VALUE
      : value
          .map((item) =>
            typeof item === "string" ? item : (JSON.stringify(item) ?? "")
          )
          .join(", ")
  }
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

const lastKey = (path: string): string => path.split(".").pop()!

// A value as Owner reads it, by the key's format rule
export function formatValue(path: string, value: Leaf): string {
  if (value === null || value === undefined) return EMPTY_VALUE
  if (isSecretKey(lastKey(path))) return REDACTED
  switch (effectiveFormat(path)) {
    case "pesos":
      return typeof value === "number" && Number.isInteger(value)
        ? formatPeso(value)
        : plainText(value)
    case "status":
      return typeof value === "string"
        ? statusText(path, value)
        : plainText(value)
    case "date": {
      if (typeof value !== "string") return plainText(value)
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value)
      const at = new Date(value)
      return Number.isNaN(at.getTime()) ? value : dateTimeText(at)
    }
    default:
      return plainText(value)
  }
}

// A value as Demo reads it, by the key's Demo rule; a key with no rule is
// hidden. A secret-looking key is redacted for everyone.
export function demoValue(path: string, value: Leaf): string {
  if (value === null || value === undefined) return EMPTY_VALUE
  if (isSecretKey(lastKey(path))) return REDACTED
  const rule = effectiveDemo(path)
  if (rule === "shown") return formatValue(path, value)
  if (rule === "hidden") return HIDDEN_IN_DEMO
  const kind = rule.slice("masked:".length) as MaskKind
  return typeof value === "string" ? maskByKind(kind, value) : HIDDEN_IN_DEMO
}

export function cut(text: string): string {
  const chars = Array.from(text)
  return chars.length > MAX_VALUE_CHARS
    ? `${chars.slice(0, MAX_VALUE_CHARS).join("")}…`
    : text
}

export function auditChanges(
  role: AdminRole,
  before: unknown,
  after: unknown
): ChangeRow[] {
  const render = role === "demo" ? demoValue : formatValue
  return auditDiff(before, after).map((row) => {
    const b = cut(render(row.path, row.before))
    const a = cut(render(row.path, row.after))
    return {
      path: row.path,
      label: fieldLabel(row.path),
      before: b,
      after: a,
      looksUnchanged: role === "demo" && b === a,
    }
  })
}
