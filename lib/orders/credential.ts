import { tokenShape } from "./secrets"
import { type LinkParams, linkQuery, linkShape } from "./signed-link"

// The one order credential (docs/specs/035-email-foundation-signed-links,
// Behavior 14): the access token or a signed link. Parsed from a page's URL
// parameters, or from the status route's headers. Pure; nothing here checks a
// signature or reads the database.

export type OrderCredential =
  | { kind: "token"; token: string }
  | { kind: "link"; sig: string; exp: string; purpose: string }

export type ParsedCredential =
  OrderCredential | { kind: "none" } | { kind: "malformed" }

const NONE = { kind: "none" } as const
const MALFORMED = { kind: "malformed" } as const

type Value = string | string[] | null | undefined

// From `searchParams`: `key`, or `sig` + `exp` + `p`. Both, a repeated
// parameter or an incomplete link is malformed; nothing at all is `none`.
export function credentialFromParams(params: {
  key?: Value
  sig?: Value
  exp?: Value
  p?: Value
}): ParsedCredential {
  const { key, sig, exp, p } = params
  const parts = [sig, exp, p]
  if ([key, ...parts].some((v) => Array.isArray(v))) return MALFORMED
  const hasLink = parts.some((v) => v != null)
  if (key != null && hasLink) return MALFORMED
  if (key != null) return { kind: "token", token: key as string }
  if (!hasLink) return NONE
  if (parts.some((v) => v == null)) return MALFORMED
  return {
    kind: "link",
    sig: sig as string,
    exp: exp as string,
    purpose: p as string,
  }
}

function only(query: URLSearchParams, name: string): Value {
  const values = query.getAll(name)
  return values.length === 0 ? null : values.length === 1 ? values[0] : values
}

// From the status route's request: `X-Order-Key` (the token) or
// `X-Order-Link` (the link's query string), never the URL
export function credentialFromHeaders(headers: {
  get(name: string): string | null
}): ParsedCredential {
  const key = headers.get("X-Order-Key")
  const link = headers.get("X-Order-Link")
  if (key != null && link != null) return MALFORMED
  if (key != null) return { kind: "token", token: key }
  if (link == null) return NONE
  const query = new URLSearchParams(link)
  return credentialFromParams({
    sig: only(query, "sig"),
    exp: only(query, "exp"),
    p: only(query, "p"),
  })
}

// True for a credential of the right shape (no secret, no database): the
// check that comes before any read
export function credentialShape(
  credential: ParsedCredential
): credential is OrderCredential {
  if (credential.kind === "token") return tokenShape(credential.token)
  if (credential.kind === "link") {
    return linkShape({
      sig: credential.sig,
      exp: credential.exp,
      p: credential.purpose,
    })
  }
  return false
}

export const linkParamsOf = (
  credential: Extract<OrderCredential, { kind: "link" }>
): LinkParams => ({
  sig: credential.sig,
  exp: credential.exp,
  p: credential.purpose,
})

// The credential as URL parameters: `key=…` or `sig=…&exp=…&p=…`. For a
// page's own address, a payment's return URL and the fake payment page.
export function credentialQuery(credential: OrderCredential): string {
  return credential.kind === "token"
    ? `key=${credential.token}`
    : linkQuery(linkParamsOf(credential))
}
