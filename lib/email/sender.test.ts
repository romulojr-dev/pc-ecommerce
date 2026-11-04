import { describe, expect, it } from "vitest"

import { senderAddress } from "./sender"

// docs/specs/038-cash-on-delivery: U20
describe("senderAddress", () => {
  it.each([
    ["PC Silicon <orders@mail.pcsilicon.tech>", "orders@mail.pcsilicon.tech"],
    ["orders@example.com", "orders@example.com"],
    ["  orders@example.com  ", "orders@example.com"],
    ['"Shop, Inc." <shop@example.com>', "shop@example.com"],
    ["Shop <shop@example.com>  ", "shop@example.com"],
  ])("%s → %s", (from, address) => {
    expect(senderAddress(from)).toBe(address)
  })
})
