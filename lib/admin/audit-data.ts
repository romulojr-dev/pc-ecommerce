// What goes into an audit row, before it is written
// (docs/specs/040-admin-permissions-audit-masking, Behavior 11, R11). Pure.

// Closed lists, extended by each Admin story, so a typo can't make a row nobody
// can find
export const AUDIT_ENTITIES = [
  "product",
  "image",
  "category",
  "brand",
  "order",
  "refund",
  "payment",
  "voucher",
  "shipping-rate",
  "store-settings",
] as const
export type AuditEntity = (typeof AUDIT_ENTITIES)[number]

export const AUDIT_ACTIONS = [
  "created",
  "updated",
  "deleted",
  "published",
  "retired",
  "status-changed",
  "cancelled",
  "stock-adjusted",
  "refund-recorded",
  "payment-reviewed",
  "image-added",
  "image-removed",
  "images-reordered",
  "image-alt-changed",
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const MAX_AUDIT_BYTES = 16 * 1024
export const REDACTED = "[redacted]"

// A key is secret-looking when any word of it is one of these: "sessionToken"
// has "token", "api_key" has "key", "design" has none
const SECRET_WORDS = new Set([
  "password",
  "passwd",
  "token",
  "secret",
  "key",
  "hash",
  "cookie",
  "authorization",
  "signature",
  "sig",
  "credential",
  "credentials",
])

function wordsOf(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

export function isSecretKey(key: string): boolean {
  return wordsOf(key).some((word) => SECRET_WORDS.has(word))
}

export class AuditDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuditDataError"
  }
}

// JSON-safe copy with secret-looking keys redacted at any depth: dates as ISO
// text, undefined dropped, anything that can't be JSON (bigint, function,
// symbol, NaN) is an error that rolls the change back
export function toAuditJson(value: unknown): unknown {
  if (value === null) return null
  switch (typeof value) {
    case "string":
    case "boolean":
      return value
    case "number":
      if (!Number.isFinite(value)) throw new AuditDataError("non-finite number")
      return value
    case "object": {
      if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) throw new AuditDataError("bad date")
        return value.toISOString()
      }
      if (Array.isArray(value)) return value.map((item) => toAuditJson(item))
      const out: Record<string, unknown> = {}
      for (const [key, item] of Object.entries(value)) {
        if (item === undefined) continue
        out[key] = isSecretKey(key) ? REDACTED : toAuditJson(item)
      }
      return out
    }
    default:
      throw new AuditDataError(`cannot store a ${typeof value}`)
  }
}

// The text to store, or null for "no value"; over the cap is an error
export function auditJsonText(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const text = JSON.stringify(toAuditJson(value))
  if (Buffer.byteLength(text, "utf8") > MAX_AUDIT_BYTES) {
    throw new AuditDataError("audit value is too large")
  }
  return text
}
