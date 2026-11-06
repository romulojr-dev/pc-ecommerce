import { describe, expect, test } from "vitest"

import {
  auditHref,
  DEFAULT_AUDIT_PARAMS,
  isCanonicalAuditQuery,
  parseAuditParams,
} from "./audit-params"

// docs/specs/047-admin-audit-log-view: B5, E3 to E10

const parse = (raw: Record<string, string>) => parseAuditParams(raw)

describe("parseAuditParams", () => {
  test("no params is the defaults, and canonical", () => {
    const parsed = parse({})
    expect(parsed.params).toEqual(DEFAULT_AUDIT_PARAMS)
    expect(isCanonicalAuditQuery({}, parsed)).toBe(true)
    expect(auditHref(parsed.params)).toBe("/admin/audit")
  })

  test("E3: a known entity", () => {
    expect(parse({ entity: "order" }).params.entity).toBe("order")
  })

  test("E4: an unknown entity is All and the URL is not canonical", () => {
    const raw = { entity: "widget" }
    const parsed = parse(raw)
    expect(parsed.params.entity).toBeNull()
    expect(isCanonicalAuditQuery(raw, parsed)).toBe(false)
  })

  test("E9: an impossible date is dropped", () => {
    const raw = { from: "2026-02-30" }
    const parsed = parse(raw)
    expect(parsed.params.from).toBe("")
    expect(isCanonicalAuditQuery(raw, parsed)).toBe(false)
  })

  test("E8: From after To clears both, says so, and keeps its URL", () => {
    const raw = { from: "2026-11-09", to: "2026-11-01" }
    const parsed = parse(raw)
    expect(parsed.params.from).toBe("")
    expect(parsed.params.to).toBe("")
    expect(parsed.rangeCleared).toBe(true)
    expect(isCanonicalAuditQuery(raw, parsed)).toBe(true)
  })

  test("the same day for both is fine", () => {
    const parsed = parse({ from: "2026-11-05", to: "2026-11-05" })
    expect(parsed.rangeCleared).toBe(false)
    expect(parsed.params.from).toBe("2026-11-05")
  })

  test("E10: pages", () => {
    expect(parse({ page: "3" }).params.page).toBe(3)
    expect(parse({ page: "0" }).params.page).toBe(1)
    expect(parse({ page: "x" }).params.page).toBe(1)
    const raw = { page: "1" }
    expect(isCanonicalAuditQuery(raw, parse(raw))).toBe(false)
  })

  test("an actor id keeps only safe characters", () => {
    expect(parse({ actor: "cm1abc-DEF_9" }).params.actor).toBe("cm1abc-DEF_9")
    expect(parse({ actor: "a b; drop" }).params.actor).toBe("")
  })

  test("the href round-trips and drops page 1", () => {
    const params = {
      entity: "order" as const,
      actor: "u1",
      from: "2026-11-01",
      to: "2026-11-05",
      page: 2,
    }
    const href = auditHref(params)
    expect(href).toBe(
      "/admin/audit?entity=order&actor=u1&from=2026-11-01&to=2026-11-05&page=2"
    )
    const raw = Object.fromEntries(new URL(href, "http://x").searchParams)
    expect(parse(raw).params).toEqual(params)
    expect(isCanonicalAuditQuery(raw, parse(raw))).toBe(true)
  })
})
