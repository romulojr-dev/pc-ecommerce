import { describe, expect, test } from "vitest"

import { auditChanges, cut, MAX_VALUE_CHARS } from "./audit-changes"
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "./audit-data"
import { RULED_KEYS } from "./audit-keys"
import {
  ACTION_LABELS,
  actionLabel,
  auditTarget,
  ENTITY_LABELS,
  entityLabel,
  fieldLabel,
  humanize,
} from "./audit-labels"

// docs/specs/047-admin-audit-log-view: B8 to B12, R6 to R9, E12 to E20, E24

describe("auditChanges as Owner", () => {
  test("E12: prices are pesos, field names are words", () => {
    expect(
      auditChanges("owner", { price: 1299900 }, { price: 1199900 })
    ).toEqual([
      {
        path: "price",
        label: "Price",
        before: "₱12,999.00",
        after: "₱11,999.00",
        looksUnchanged: false,
      },
    ])
  })

  test("E14 and E15: stock plain, statuses by label", () => {
    expect(
      auditChanges("owner", { stock: 12 }, { stock: 17 })[0]
    ).toMatchObject({ before: "12", after: "17" })
    expect(
      auditChanges("owner", { status: "PAID" }, { status: "PROCESSING" })[0]
    ).toMatchObject({ before: "Paid", after: "Processing" })
    expect(
      auditChanges(
        "owner",
        { status: "PAID" },
        { status: "CANCELLED", cancelReason: "OUT_OF_STOCK" }
      ).map((r) => [r.label, r.after])
    ).toEqual([
      ["Cancel reason", "Out of stock"],
      ["Status", "Cancelled"],
    ])
    expect(auditChanges("owner", null, { reason: "RECEIVED" })[0].after).toBe(
      "Received"
    )
  })

  test("dates: an instant in Manila time, a calendar day as a date", () => {
    const [instant] = auditChanges("owner", null, {
      paidAt: "2026-11-05T15:30:00.000Z",
    })
    expect(instant.after).toContain("11:30 PM")
    expect(instant.after).toContain("5 Nov 2026")
    const [day] = auditChanges("owner", null, { preorderShipsOn: "2027-01-15" })
    expect(day.after).toBe("January 15, 2027")
  })

  test("booleans, arrays, nulls and unknown keys read as plain text", () => {
    const rows = auditChanges(
      "owner",
      { isFeatured: false, salePrice: null },
      {
        isFeatured: true,
        salePrice: 100,
        boxContents: ["a", "b"],
        couponNote2: "x",
      }
    )
    const by = Object.fromEntries(rows.map((r) => [r.path, r]))
    expect(by.isFeatured).toMatchObject({ before: "No", after: "Yes" })
    expect(by.salePrice).toMatchObject({ before: "—", after: "₱1.00" })
    expect(by.boxContents.after).toBe("a, b")
    expect(by.couponNote2.after).toBe("x")
  })

  test("E24: a secret-looking key is redacted for every role", () => {
    for (const role of ["owner", "staff", "demo"] as const) {
      const [row] = auditChanges(role, null, { sessionToken: "abc123" })
      expect(row.after).toBe("[redacted]")
    }
  })

  test("a long value is cut", () => {
    const text = cut("x".repeat(MAX_VALUE_CHARS + 50))
    expect(Array.from(text)).toHaveLength(MAX_VALUE_CHARS + 1)
    expect(text.endsWith("…")).toBe(true)
  })
})

describe("auditChanges as Demo", () => {
  test("E16 and E17: free text hidden, tracking masked", () => {
    const rows = auditChanges("demo", null, {
      note: "Leave with guard",
      trackingNumber: "JT1234567890",
      status: "SHIPPED",
    })
    const by = Object.fromEntries(rows.map((r) => [r.path, r.after]))
    expect(by.note).toBe("Hidden in demo")
    expect(by.trackingNumber).toBe("•••• 7890")
    expect(by.status).toBe("Shipped")
  })

  test("E18: two different names still make a changed row, flagged", () => {
    const [row] = auditChanges(
      "demo",
      { contactName: "Ana Reyes" },
      { contactName: "Alma Rios" }
    )
    expect(row.before).toBe(row.after)
    expect(row.looksUnchanged).toBe(true)
    expect(JSON.stringify(row)).not.toMatch(/Reyes|Rios/)
  })

  test("E24b: an unregistered key is hidden for Demo, plain for Owner", () => {
    expect(auditChanges("demo", null, { couponNote2: "hush" })[0].after).toBe(
      "Hidden in demo"
    )
    expect(auditChanges("owner", null, { couponNote2: "hush" })[0].after).toBe(
      "hush"
    )
  })

  test("nested customer keys are masked at any depth", () => {
    const [row] = auditChanges("demo", null, {
      customer: { guestEmail: "ana.reyes@example.com" },
    })
    expect(row.after).toBe("a•••@••••.•••")
  })
})

describe("labels and links", () => {
  test("every entity and action has a label", () => {
    for (const e of AUDIT_ENTITIES) expect(ENTITY_LABELS[e]).toBeTruthy()
    for (const a of AUDIT_ACTIONS) expect(ACTION_LABELS[a]).toBeTruthy()
    expect(entityLabel("shipping-rate")).toBe("Shipping rate")
    expect(actionLabel("stock-adjusted")).toBe("Stock adjusted")
    expect(entityLabel("new-thing")).toBe("New thing")
  })

  test("no field label is camelCase or empty", () => {
    for (const key of [...RULED_KEYS, "specs.coreCount", "a.b"]) {
      const label = fieldLabel(key)
      expect(label, key).not.toMatch(/[a-z][A-Z]/)
      expect(label.length).toBeGreaterThan(0)
    }
    expect(fieldLabel("salePrice")).toBe("Sale price")
    expect(fieldLabel("sku")).toBe("SKU")
    expect(fieldLabel("specs.cores")).toBe("Specs · Cores")
    expect(humanize("OUT_OF_STOCK")).toBe("Out of stock")
  })

  test("E15, E19, E20: links only where the screen exists and the viewer may open it", () => {
    expect(
      auditTarget("owner", "order", "cuid1", { orderNumber: "PCS-ABCD2345" })
    ).toEqual({ label: "PCS-ABCD2345", href: "/admin/orders/PCS-ABCD2345" })
    expect(
      auditTarget("demo", "product", "p1", {
        product: { name: "Ryzen 5 7600", sku: "CPU-1" },
      })
    ).toEqual({ label: "Ryzen 5 7600 (CPU-1)", href: "/admin/products/p1" })
    expect(auditTarget("owner", "voucher", "v1", {})).toEqual({
      label: "v1",
      href: null,
    })
    expect(auditTarget("owner", "product", "gone", {})).toEqual({
      label: "gone",
      href: null,
    })
    expect(
      auditTarget("staff", "product", "p1", {
        product: { name: "A", sku: "B" },
      }).href
    ).toBeNull()
  })
})
