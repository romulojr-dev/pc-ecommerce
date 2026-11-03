import { describe, expect, it } from "vitest"

import {
  credentialFromHeaders,
  credentialFromParams,
  credentialQuery,
  credentialShape,
} from "./credential"
import { newAccessToken } from "./secrets"
import { signOrderLink } from "./signed-link"

// docs/specs/035-email-foundation-signed-links: L9

const TOKEN = newAccessToken()
const link = signOrderLink(
  "S".repeat(48),
  "PCS-7KQ2M9XD",
  "view",
  1_800_000_000
)

describe("credentialFromParams (L9)", () => {
  it("reads a token", () => {
    expect(credentialFromParams({ key: TOKEN })).toEqual({
      kind: "token",
      token: TOKEN,
    })
  })
  it("reads a link", () => {
    expect(credentialFromParams(link)).toEqual({
      kind: "link",
      sig: link.sig,
      exp: link.exp,
      purpose: "view",
    })
  })
  it("refuses a key and a link together", () => {
    expect(credentialFromParams({ key: TOKEN, ...link })).toEqual({
      kind: "malformed",
    })
  })
  it("has nothing for no parameters", () => {
    expect(credentialFromParams({})).toEqual({ kind: "none" })
  })
  it("refuses a repeated parameter and an incomplete link", () => {
    expect(credentialFromParams({ key: [TOKEN, TOKEN] })).toEqual({
      kind: "malformed",
    })
    expect(credentialFromParams({ sig: link.sig, exp: link.exp })).toEqual({
      kind: "malformed",
    })
  })
})

describe("credentialFromHeaders", () => {
  const headers = (h: Record<string, string>) => ({
    get: (name: string) => h[name] ?? null,
  })
  it("reads the key header", () => {
    expect(credentialFromHeaders(headers({ "X-Order-Key": TOKEN }))).toEqual({
      kind: "token",
      token: TOKEN,
    })
  })
  it("reads the link header as a query string", () => {
    expect(
      credentialFromHeaders(
        headers({ "X-Order-Link": `sig=${link.sig}&exp=${link.exp}&p=view` })
      )
    ).toMatchObject({ kind: "link", sig: link.sig })
  })
  it("refuses both, and a doubled link parameter", () => {
    expect(
      credentialFromHeaders(
        headers({ "X-Order-Key": TOKEN, "X-Order-Link": "sig=a&exp=b&p=view" })
      )
    ).toEqual({ kind: "malformed" })
    expect(
      credentialFromHeaders(
        headers({ "X-Order-Link": `sig=a&sig=b&exp=${link.exp}&p=view` })
      )
    ).toEqual({ kind: "malformed" })
  })
  it("has nothing for no headers", () => {
    expect(credentialFromHeaders(headers({}))).toEqual({ kind: "none" })
  })
})

describe("credentialShape and credentialQuery", () => {
  it("checks shapes", () => {
    expect(credentialShape({ kind: "token", token: TOKEN })).toBe(true)
    expect(credentialShape({ kind: "token", token: "short" })).toBe(false)
    expect(credentialShape({ kind: "none" })).toBe(false)
    expect(
      credentialShape({
        kind: "link",
        sig: link.sig,
        exp: link.exp,
        purpose: "view",
      })
    ).toBe(true)
    expect(
      credentialShape({
        kind: "link",
        sig: "x",
        exp: link.exp,
        purpose: "view",
      })
    ).toBe(false)
  })
  it("serializes back to parameters", () => {
    expect(credentialQuery({ kind: "token", token: TOKEN })).toBe(
      `key=${TOKEN}`
    )
    expect(
      credentialQuery({
        kind: "link",
        sig: link.sig,
        exp: link.exp,
        purpose: "view",
      })
    ).toBe(`sig=${link.sig}&exp=${link.exp}&p=view`)
  })
})
