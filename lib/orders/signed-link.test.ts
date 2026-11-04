import { describe, expect, it } from "vitest"

import {
  codConfirmExp,
  linkShape,
  type LinkPurpose,
  newCodConfirmLink,
  newViewLink,
  orderLinkPath,
  orderLinkUrl,
  signOrderLink,
  verifyOrderLink,
} from "./signed-link"

// docs/specs/035-email-foundation-signed-links: L1–L8

const SECRET = "S".repeat(48)
const NUMBER = "PCS-7KQ2M9XD"
// Placed 2026-11-01T07:00:00Z + 90 days
const E = Date.parse("2027-01-30T07:00:00Z") / 1000
const NOW = new Date("2026-11-01T08:00:00Z")

const link = signOrderLink(SECRET, NUMBER, "view", E)
const verify = (
  params = link,
  {
    now = NOW,
    number = NUMBER,
    secret = SECRET,
    purpose = "view" as LinkPurpose,
  } = {}
) => verifyOrderLink(secret, number, params, purpose, now)

describe("signOrderLink and verifyOrderLink", () => {
  it("signs and verifies; the signature is 43 characters and stable (L1)", () => {
    expect(verify()).toBe("ok")
    expect(link.sig).toHaveLength(43)
    expect(signOrderLink(SECRET, NUMBER, "view", E)).toEqual(link)
  })

  it("is valid until exp, expired from exp on (L2)", () => {
    expect(verify(link, { now: new Date((E - 1) * 1000) })).toBe("ok")
    expect(verify(link, { now: new Date(E * 1000) })).toBe("expired")
  })

  it("is for one order (L3)", () => {
    expect(verify(link, { number: "PCS-7KQ2M9XE" })).toBe("invalid")
  })

  it("is for one purpose (L4)", () => {
    const cod = signOrderLink(SECRET, NUMBER, "cod-confirm", E)
    expect(verify(cod)).toBe("invalid")
    expect(verify(cod, { purpose: "cod-confirm" })).toBe("ok")
    expect(verify({ ...link, p: "cod-confirm" })).toBe("invalid")
    expect(
      verify({ ...link, p: "cod-confirm" }, { purpose: "cod-confirm" })
    ).toBe("invalid")
  })

  it("rejects any tampering (L5)", () => {
    expect(verify({ ...link, exp: String(E + 1) })).toBe("invalid")
    const flipped = link.sig.startsWith("A") ? "B" : "A"
    expect(verify({ ...link, sig: flipped + link.sig.slice(1) })).toBe(
      "invalid"
    )
    expect(verify(link, { secret: "T".repeat(48) })).toBe("invalid")
  })

  it("is revoked by rotating the secret (L6)", () => {
    expect(verify(link, { secret: "R".repeat(48) })).toBe("invalid")
  })

  it("an expired link with a bad signature is invalid, not expired", () => {
    expect(
      verify({ ...link, sig: "A".repeat(43) }, { now: new Date(E * 2000) })
    ).toBe("invalid")
  })
})

describe("linkShape (L7)", () => {
  const ok = { sig: link.sig, exp: String(E), p: "view" as unknown }
  it("accepts a good link", () => {
    expect(linkShape(ok)).toBe(true)
    expect(linkShape({ ...ok, p: "cod-confirm" })).toBe(true)
  })
  it.each([
    ["sig of 42", { sig: link.sig.slice(0, 42) }],
    ["sig of 44", { sig: `${link.sig}A` }],
    ["sig with padding", { sig: `${link.sig.slice(0, 42)}=` }],
    ["sig with +", { sig: `${link.sig.slice(0, 42)}+` }],
    ["exp of 9 digits", { exp: "179300000" }],
    ["exp of 11 digits", { exp: "17930000000" }],
    ["exp with a sign", { exp: "+179300000" }],
    ["exp with a leading zero", { exp: "0793000000" }],
    ["p in capitals", { p: "VIEW" }],
    ["p missing", { p: undefined }],
    ["p unknown", { p: "edit" }],
    ["sig as an array", { sig: [link.sig] }],
  ])("refuses %s", (_name, override) => {
    expect(linkShape({ ...ok, ...override })).toBe(false)
  })
  it("refuses a sig whose last character is not canonical", () => {
    // 43 characters carry 258 bits for 256: only some last characters are
    // canonical, so one of two neighbours is always refused
    const last = link.sig.at(-1) as string
    const other = last === "A" ? "B" : "A"
    const results = [last, other].map((c) =>
      linkShape({ ...ok, sig: link.sig.slice(0, 42) + c })
    )
    expect(results).toContain(true)
  })
  it("does not verify a malformed order number", () => {
    expect(verify(link, { number: "pcs-7kq2m9xd" })).toBe("invalid")
    expect(verify(link, { number: "PCS-7KQ2M9XI" })).toBe("invalid")
  })
})

describe("paths and URLs (L8)", () => {
  it("builds the path with the parameters in a fixed order", () => {
    expect(orderLinkPath(NUMBER, link)).toBe(
      `/orders/${NUMBER}?sig=${link.sig}&exp=${E}&p=view`
    )
  })
  it("builds an absolute URL from the site URL with no doubled slash", () => {
    expect(orderLinkUrl("https://pcsilicon.tech/", NUMBER, link)).toBe(
      `https://pcsilicon.tech/orders/${NUMBER}?sig=${link.sig}&exp=${E}&p=view`
    )
  })
})

describe("newViewLink", () => {
  it("lasts 90 days from now", () => {
    const now = new Date("2026-11-01T07:00:00Z")
    expect(newViewLink(SECRET, NUMBER, now).exp).toBe(String(E))
    expect(verify(newViewLink(SECRET, NUMBER, now), { now })).toBe("ok")
  })
})

// docs/specs/038-cash-on-delivery: U19
describe("the cod-confirm link", () => {
  // 2026-11-05 10:00:00.750 in Manila: a deadline with milliseconds
  const expiresAt = new Date("2026-11-05T02:00:00.750Z")
  const cod = newCodConfirmLink(SECRET, NUMBER, expiresAt)
  const verifyCod = (now: Date) =>
    verifyOrderLink(SECRET, NUMBER, cod, "cod-confirm", now)

  it("expires at the deadline rounded down to whole seconds", () => {
    expect(codConfirmExp(expiresAt)).toBe(
      Date.parse("2026-11-05T02:00:00Z") / 1000
    )
    expect(cod.exp).toBe(String(codConfirmExp(expiresAt)))
    expect(cod.p).toBe("cod-confirm")
  })

  it("is valid before the expiry and expired from it", () => {
    const exp = codConfirmExp(expiresAt) * 1000
    expect(verifyCod(new Date(exp - 1))).toBe("ok")
    expect(verifyCod(new Date(exp))).toBe("expired")
    expect(verifyCod(new Date(expiresAt.getTime() + 1))).toBe("expired")
  })

  it("is the same link for the same order and deadline", () => {
    expect(newCodConfirmLink(SECRET, NUMBER, expiresAt)).toEqual(cod)
  })

  it("never outlives the deadline, and a view link doesn't verify as it", () => {
    expect(codConfirmExp(expiresAt) * 1000).toBeLessThanOrEqual(
      expiresAt.getTime()
    )
    expect(verify(cod)).toBe("invalid")
  })
})
