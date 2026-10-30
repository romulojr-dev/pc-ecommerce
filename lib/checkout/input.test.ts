import { describe, expect, it } from "vitest"

import { CHECKOUT_COPY, checkoutInputSchema, fieldErrors } from "./input"

// Docs: docs/specs/029-checkout-steps, I1–I9, I13, I14, I16

const contact = {
  email: "ana@example.com",
  name: "Ana Santos",
  mobile: "0917 123 4567",
}
const address = {
  regionCode: "1300000000",
  provinceCode: "1300000000",
  cityCode: "1381300000",
  barangayCode: "1381300001",
  street: "12 Mabini St",
  zip: "1100",
}
const delivery = (over: object = {}, addr: object = {}) => ({
  method: "delivery",
  contact: { ...contact, ...over },
  address: { ...address, ...addr },
})

const errorsOf = (input: unknown) => {
  const result = checkoutInputSchema.safeParse(input)
  if (result.success) throw new Error("expected a failure")
  return fieldErrors(result.error)
}

describe("checkoutInputSchema", () => {
  it("takes the contact above with delivery to Quezon City (I1)", () => {
    const result = checkoutInputSchema.parse(delivery())
    expect(result.contact.mobile).toBe("+639171234567")
  })

  it("trims the email and keeps its case (I4)", () => {
    const result = checkoutInputSchema.parse(
      delivery({ email: "  Ana@Example.com  " })
    )
    expect(result.contact.email).toBe("Ana@Example.com")
  })

  it.each(["ana@", "ana example.com", "x".repeat(255)])(
    "refuses the email %j (I5)",
    (email) => {
      expect(errorsOf(delivery({ email }))["contact.email"]).toBe(
        CHECKOUT_COPY.emailInvalid
      )
    }
  )

  it("asks for a missing email (I5)", () => {
    expect(errorsOf(delivery({ email: "" }))["contact.email"]).toBe(
      CHECKOUT_COPY.emailMissing
    )
  })

  it("trims the name and collapses inner spaces (I6)", () => {
    expect(
      checkoutInputSchema.parse(delivery({ name: "  Ana   Santos  " })).contact
        .name
    ).toBe("Ana Santos")
  })

  it("refuses an empty or long name (I6)", () => {
    expect(errorsOf(delivery({ name: "   " }))["contact.name"]).toBe(
      CHECKOUT_COPY.nameMissing
    )
    expect(errorsOf(delivery({ name: "a".repeat(101) }))["contact.name"]).toBe(
      CHECKOUT_COPY.nameLong
    )
  })

  it("explains a missing and a wrong mobile number (I3)", () => {
    expect(errorsOf(delivery({ mobile: "" }))["contact.mobile"]).toBe(
      CHECKOUT_COPY.mobileMissing
    )
    expect(
      errorsOf(delivery({ mobile: "02 8123 4567" }))["contact.mobile"]
    ).toBe(CHECKOUT_COPY.mobileInvalid)
  })

  it("trims the ZIP and keeps its leading zero (I7)", () => {
    expect(
      checkoutInputSchema.parse(delivery({}, { zip: " 1100 " }))
    ).toMatchObject({ address: { zip: "1100" } })
    expect(
      checkoutInputSchema.parse(delivery({}, { zip: "0900" }))
    ).toMatchObject({ address: { zip: "0900" } })
  })

  it.each(["110", "11000", "abcd", ""])("refuses the ZIP %j (I8)", (zip) => {
    expect(errorsOf(delivery({}, { zip }))["address.zip"]).toBe(
      "Enter a 4-digit ZIP code."
    )
  })

  it("checks the street (I9)", () => {
    expect(errorsOf(delivery({}, { street: "" }))["address.street"]).toBe(
      CHECKOUT_COPY.streetMissing
    )
    expect(
      errorsOf(delivery({}, { street: "s".repeat(201) }))["address.street"]
    ).toBe(CHECKOUT_COPY.streetLong)
  })

  it("asks for each place by level", () => {
    const errors = errorsOf(
      delivery(
        {},
        { regionCode: "", provinceCode: "12", cityCode: 5, barangayCode: null }
      )
    )
    expect(errors["address.regionCode"]).toBe(CHECKOUT_COPY.region)
    expect(errors["address.provinceCode"]).toBe(CHECKOUT_COPY.province)
    expect(errors["address.cityCode"]).toBe(CHECKOUT_COPY.city)
    expect(errors["address.barangayCode"]).toBe(CHECKOUT_COPY.barangay)
  })

  it("drops fields it does not know and never takes names or money (I13)", () => {
    const result = checkoutInputSchema.parse({
      ...delivery(),
      fee: 0,
      subtotal: 1,
      cartId: "x",
      address: { ...address, regionName: "Fake" },
    })
    expect(result).not.toHaveProperty("fee")
    expect(result).not.toHaveProperty("subtotal")
    expect(result).not.toHaveProperty("cartId")
    expect((result as { address: object }).address).not.toHaveProperty(
      "regionName"
    )
  })

  it("takes pickup without an address and drops a sent one (I14)", () => {
    const result = checkoutInputSchema.parse({
      method: "pickup",
      contact,
      address,
    })
    expect(result.method).toBe("pickup")
    expect(result).not.toHaveProperty("address")
  })

  it("refuses delivery without an address", () => {
    expect(errorsOf({ method: "delivery", contact }).address).toBeDefined()
  })

  it.each([
    null,
    "text",
    5,
    [],
    {},
    { method: "teleport", contact },
    "x".repeat(100_000),
  ])("refuses a payload that is not one: %#", (input) => {
    expect(checkoutInputSchema.safeParse(input).success).toBe(false)
  })
})
