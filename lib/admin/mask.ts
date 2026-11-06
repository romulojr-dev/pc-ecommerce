import { demoRuleOf, effectiveDemo, type MaskKind } from "./audit-keys"
import type { AdminRole } from "./permissions"

// Customer-data masking for Demo (docs/specs/040-admin-permissions-audit-
// masking, Behavior 13–17, R14–R17). Pure: every function takes the viewer's
// role, Owner and Staff get the real values, Demo gets masks. The queries in
// lib/admin/queries apply these before anything reaches a page, so the real
// values never enter the server component output or the RSC payload.
//
// A Demo view has no field that can hold a real value: its text fields are
// `Masked`, a type only the mask functions below produce.

declare const maskedBrand: unique symbol
export type Masked = string & { readonly [maskedBrand]: true }

const BULLETS = "•••"
export const HIDDEN_IN_DEMO = "Hidden in demo" as Masked
export const STORE_PICKUP = "Store pickup"

const asMasked = (value: string) => value as Masked

// "Ana Reyes" -> "A••• R•••": the first letter of each word, fixed bullets
export function maskName(name: string): Masked {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return asMasked(BULLETS)
  return asMasked(
    words.map((word) => `${Array.from(word)[0]}${BULLETS}`).join(" ")
  )
}

// "ana.reyes@example.com" -> "a•••@••••.•••": the domain is hidden, the shape
// fixed
export function maskEmail(email: string): Masked {
  const first = Array.from(email.trim())[0]
  return asMasked(`${first && first !== "@" ? first : ""}${BULLETS}@••••.•••`)
}

// Everything but the country code
export function maskMobile(mobile?: string): Masked {
  void mobile
  return asMasked("+63•••••••••")
}

export function maskFreeText(text?: string): Masked {
  void text
  return HIDDEN_IN_DEMO
}

// A tracking number identifies a parcel for anyone holding it: Demo sees the
// last four after bullets ("•••• 4821"). Under 8 characters it shows only the
// bullets, so a short number is never revealed whole (docs/specs/043-order-
// fulfillment-transitions, R6a, D6).
export function maskTracking(trackingNumber: string): Masked {
  const chars = Array.from(trackingNumber.trim())
  return asMasked(
    chars.length >= 8 ? `•••• ${chars.slice(-4).join("")}` : "••••"
  )
}

// The courier and tracking number an order was shipped with. The courier is
// not personal and is shown in full; Demo's tracking number is `Masked`.
export type ParcelView =
  | { masked: false; courier: string; trackingNumber: string }
  | { masked: true; courier: string; trackingNumber: Masked }

export function parcelView(
  role: AdminRole,
  raw: { courier: string | null; trackingNumber: string | null }
): ParcelView | null {
  if (!raw.courier || !raw.trackingNumber) return null
  return role === "demo"
    ? {
        masked: true,
        courier: raw.courier,
        trackingNumber: maskTracking(raw.trackingNumber),
      }
    : {
        masked: false,
        courier: raw.courier,
        trackingNumber: raw.trackingNumber,
      }
}

// ---- Order contact and address ----

export type RawContact = {
  guestEmail: string
  contactName: string
  contactMobile: string
}

export type ContactView =
  | { masked: false; name: string; email: string; mobile: string }
  | { masked: true; name: Masked; email: Masked; mobile: Masked }

export function contactView(role: AdminRole, raw: RawContact): ContactView {
  if (role !== "demo") {
    return {
      masked: false,
      name: raw.contactName,
      email: raw.guestEmail,
      mobile: raw.contactMobile,
    }
  }
  return {
    masked: true,
    name: maskName(raw.contactName),
    email: maskEmail(raw.guestEmail),
    mobile: maskMobile(raw.contactMobile),
  }
}

export type RawAddress = {
  fulfillment: "DELIVERY" | "PICKUP"
  regionName: string | null
  zone: string | null
  provinceName: string | null
  cityName: string | null
  barangayName: string | null
  street: string | null
  zip: string | null
}

// Demo keeps only the region (and the zone); the street, ZIP, barangay, city
// and province never leave the query
export type AddressView =
  | { kind: "pickup" }
  | {
      kind: "delivery"
      masked: false
      regionName: string | null
      zone: string | null
      street: string | null
      zip: string | null
      barangayName: string | null
      cityName: string | null
      provinceName: string | null
    }
  | {
      kind: "delivery"
      masked: true
      regionName: string | null
      zone: string | null
    }

export function addressView(role: AdminRole, raw: RawAddress): AddressView {
  if (raw.fulfillment === "PICKUP") return { kind: "pickup" }
  if (role !== "demo") {
    return {
      kind: "delivery",
      masked: false,
      regionName: raw.regionName,
      zone: raw.zone,
      street: raw.street,
      zip: raw.zip,
      barangayName: raw.barangayName,
      cityName: raw.cityName,
      provinceName: raw.provinceName,
    }
  }
  return {
    kind: "delivery",
    masked: true,
    regionName: raw.regionName,
    zone: raw.zone,
  }
}

// ---- Audit entries ----

// Which Demo rule a key has comes from the registry in audit-keys.ts (spec
// 047, D13): customer keys are masked, free text and every key with no rule
// are hidden, the keys listed as shown are kept. Walks any depth.

export function maskByKind(kind: MaskKind, value: string): Masked {
  switch (kind) {
    case "name":
      return maskName(value)
    case "email":
      return maskEmail(value)
    case "mobile":
      return maskMobile(value)
    case "tracking":
      return maskTracking(value)
    case "address":
      return HIDDEN_IN_DEMO
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const isContainer = (value: unknown): boolean =>
  isObject(value) || (Array.isArray(value) && value.some(isObject))

function maskAt(path: string, value: unknown): unknown {
  // A container is decided by its leaves, unless its own key is hidden
  if (isContainer(value) && demoRuleOf(path) !== "hidden") {
    return maskWalk(value, path)
  }
  if (value === null || value === undefined) return value
  const rule = effectiveDemo(path)
  if (rule === "shown") return value
  if (rule === "hidden") return HIDDEN_IN_DEMO
  return typeof value === "string"
    ? maskByKind(rule.slice("masked:".length) as MaskKind, value)
    : HIDDEN_IN_DEMO
}

function maskWalk(value: unknown, path: string): unknown {
  if (Array.isArray(value)) return value.map((item) => maskAt(path, item))
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        maskAt(path ? `${path}.${key}` : key, item),
      ])
    )
  }
  return value
}

// The audit entry's before / after for Demo: known customer keys masked,
// free-text keys and keys with no rule "Hidden in demo", the keys the
// registry lists as shown kept.
export function maskAuditJson(value: unknown): unknown {
  return maskWalk(value, "")
}

// Replaced by the paginated query in task 3 of spec 047
export type AuditEntryView = {
  id: string
  entity: string
  entityId: string
  action: string
  // Name and role only: never the actor's email
  actor: { name: string; role: string }
  before: unknown
  after: unknown
  createdAt: Date
}

export type RawAuditEntry = Omit<AuditEntryView, "actor"> & {
  actor: { name: string; role: string }
}

export function auditEntryView(
  role: AdminRole,
  raw: RawAuditEntry
): AuditEntryView {
  if (role !== "demo") return raw
  return {
    ...raw,
    before: maskAuditJson(raw.before),
    after: maskAuditJson(raw.after),
  }
}
