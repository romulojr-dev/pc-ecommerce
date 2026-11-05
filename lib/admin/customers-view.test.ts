import { describe, expect, it } from "vitest"

import { buyerHref, buyerLine, demoKeyRank, rankKey } from "./customers-view"

// docs/specs/042-admin-customers, R7, R8

describe("Demo rank keys", () => {
  it("round-trips a rank", () => {
    expect(rankKey(26)).toBe("c26")
    expect(demoKeyRank("c1")).toBe(1)
    expect(demoKeyRank("c26")).toBe(26)
  })

  it.each([
    "c0",
    "C1",
    "c01",
    "c-1",
    "c1.5",
    "c",
    "",
    "ana@example.com",
    "c1 ",
    "c12345678",
  ])("%j is not a key", (key) => {
    expect(demoKeyRank(key)).toBeNull()
  })
})

describe("the link into the order list", () => {
  it("is the list filtered by buyer, key encoded", () => {
    expect(buyerHref("c3")).toBe("/admin/orders?buyer=c3")
    expect(buyerHref("ana.reyes@example.com")).toBe(
      "/admin/orders?buyer=ana.reyes%40example.com"
    )
  })

  it("names the customer or says it is unknown", () => {
    expect(buyerLine("Ana Reyes")).toBe("Orders from Ana Reyes")
    expect(buyerLine(null)).toBe("Orders from an unknown customer")
  })
})
