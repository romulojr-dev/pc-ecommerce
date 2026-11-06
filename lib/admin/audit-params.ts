import { first } from "@/lib/listing-filters/raw"
import type { RawSearchParams } from "@/lib/listing-filters/types"

import { AUDIT_ENTITIES, type AuditEntity } from "./audit-data"
import { parseManilaDay } from "./manila-day"

// URL state of the audit log (docs/specs/047-admin-audit-log-view, Behavior 5,
// E3 to E11), parsed and written only here, with the same rules as the other
// Admin lists: a bad value is the default and a URL that isn't the canonical
// one redirects. Pure.

export const AUDIT_PATH = "/admin/audit"
export const AUDIT_PAGE_SIZE = 25
const ACTOR_MAX = 64

export type AuditParams = {
  entity: AuditEntity | null
  // A user id; whether it exists is the query's to say
  actor: string
  // Asia/Manila days, YYYY-MM-DD, "" for open
  from: string
  to: string
  page: number
}

export const DEFAULT_AUDIT_PARAMS: AuditParams = {
  entity: null,
  actor: "",
  from: "",
  to: "",
  page: 1,
}

function parsePage(value: string | undefined): number {
  return value !== undefined && /^[1-9]\d{0,6}$/.test(value) ? Number(value) : 1
}

export type ParsedAuditParams = {
  params: AuditParams
  // From was after To, so both were cleared and the page says so (D4). The
  // URL is not redirected, or the notice would be lost with it.
  rangeCleared: boolean
}

export function parseAuditParams(raw: RawSearchParams): ParsedAuditParams {
  const entity = first(raw.entity)
  const actor = (first(raw.actor) ?? "").trim().slice(0, ACTOR_MAX)
  let from = parseManilaDay(first(raw.from) ?? "") ?? ""
  let to = parseManilaDay(first(raw.to) ?? "") ?? ""
  let rangeCleared = false
  // YYYY-MM-DD sorts as text
  if (from && to && from > to) {
    from = ""
    to = ""
    rangeCleared = true
  }
  return {
    params: {
      entity: AUDIT_ENTITIES.find((e) => e === entity) ?? null,
      actor: /^[\w-]+$/.test(actor) ? actor : "",
      from,
      to,
      page: parsePage(first(raw.page)),
    },
    rangeCleared,
  }
}

export function serializeAuditParams(params: AuditParams): [string, string][] {
  const entries: [string, string][] = []
  if (params.entity) entries.push(["entity", params.entity])
  if (params.actor) entries.push(["actor", params.actor])
  if (params.from) entries.push(["from", params.from])
  if (params.to) entries.push(["to", params.to])
  if (params.page > 1) entries.push(["page", String(params.page)])
  return entries
}

export function auditHref(params: AuditParams): string {
  const query = new URLSearchParams(serializeAuditParams(params)).toString()
  return query ? `${AUDIT_PATH}?${query}` : AUDIT_PATH
}

export function isCanonicalAuditQuery(
  raw: RawSearchParams,
  parsed: ParsedAuditParams
): boolean {
  // A cleared range keeps its URL so the notice can show (see above)
  if (parsed.rangeCleared) return true
  const wanted = serializeAuditParams(parsed.params)
  const given = Object.entries(raw).filter(([, v]) => v !== undefined)
  if (given.length !== wanted.length) return false
  return wanted.every(([key, value]) => raw[key] === value)
}

export const hasActiveAuditFilters = (params: AuditParams): boolean =>
  params.entity !== null ||
  params.actor !== "" ||
  params.from !== "" ||
  params.to !== ""
