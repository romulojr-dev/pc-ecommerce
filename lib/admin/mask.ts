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

const EMAIL_KEYS = new Set(["guestemail", "email", "customeremail"])
const NAME_KEYS = new Set(["contactname", "customername"])
const MOBILE_KEYS = new Set([
  "contactmobile",
  "mobile",
  "phone",
  "customermobile",
])
const ADDRESS_KEYS = new Set([
  "street",
  "zip",
  "barangayname",
  "cityname",
  "provincename",
  "barangaycode",
  "citycode",
  "provincecode",
  "address",
])
const FREE_TEXT_KEYS = new Set([
  "note",
  "notes",
  "comment",
  "comments",
  "message",
  "memo",
  "remarks",
  "instructions",
])

function maskJsonValue(key: string, value: unknown): unknown {
  const k = key.toLowerCase()
  if (typeof value === "string") {
    if (EMAIL_KEYS.has(k)) return maskEmail(value)
    if (NAME_KEYS.has(k)) return maskName(value)
    if (MOBILE_KEYS.has(k)) return maskMobile(value)
    if (ADDRESS_KEYS.has(k) || FREE_TEXT_KEYS.has(k)) return HIDDEN_IN_DEMO
  } else if (value !== null && value !== undefined) {
    if (ADDRESS_KEYS.has(k) || FREE_TEXT_KEYS.has(k)) return HIDDEN_IN_DEMO
  }
  return maskAuditJson(value)
}

// The audit entry's before / after for Demo: known customer keys masked,
// free-text keys "Hidden in demo", every other key kept. Walks any depth.
export function maskAuditJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => maskAuditJson(item))
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        maskJsonValue(key, item),
      ])
    )
  }
  return value
}

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
