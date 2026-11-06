import { describe, expect, test } from "vitest"

import {
  demoRuleOf,
  effectiveDemo,
  effectiveFormat,
  formatRuleOf,
  MASK_KINDS,
  RULED_KEYS,
} from "./audit-keys"
import { maskAuditJson, maskByKind } from "./mask"

// docs/specs/047-admin-audit-log-view: B12, R9, E24b

describe("the two rules", () => {
  test("every ruled key has both a format and a Demo rule", () => {
    for (const key of RULED_KEYS) {
      expect(formatRuleOf(key), key).not.toBeNull()
      expect(demoRuleOf(key), key).not.toBeNull()
    }
  })

  test("rules are found by leaf name, any case, and by the specs prefix", () => {
    expect(formatRuleOf("SalePrice")).toBe("pesos")
    expect(formatRuleOf("after.salePrice")).toBe("pesos")
    expect(demoRuleOf("specs.cores")).toBe("shown")
    expect(formatRuleOf("specs.anything.deep")).toBe("plain")
  })

  test("a key with no rule is plain for Owner and hidden for Demo (E24b)", () => {
    expect(formatRuleOf("couponNote2")).toBeNull()
    expect(demoRuleOf("couponNote2")).toBeNull()
    expect(effectiveFormat("couponNote2")).toBe("plain")
    expect(effectiveDemo("couponNote2")).toBe("hidden")
    expect(maskAuditJson({ couponNote2: "a thing", price: 100 })).toEqual({
      couponNote2: "Hidden in demo",
      price: 100,
    })
  })

  test("a prototype name is not a rule", () => {
    expect(formatRuleOf("constructor")).toBeNull()
    expect(formatRuleOf("toString")).toBeNull()
  })

  test("every masked kind has a masker", () => {
    for (const kind of MASK_KINDS) {
      expect(typeof maskByKind(kind, "Ana Reyes")).toBe("string")
    }
    for (const key of RULED_KEYS) {
      const rule = demoRuleOf(key)!
      if (rule.startsWith("masked:")) {
        expect(MASK_KINDS).toContain(rule.slice("masked:".length))
      }
    }
  })
})
