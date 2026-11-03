import { createHmac, timingSafeEqual } from "node:crypto"

import { orderNumberShape } from "./number"
import { tokenShape } from "./secrets"

// Signed order links (docs/specs/035-email-foundation-signed-links,
// Behavior 9–12, §4 Links; ADR 0011). An email carries
// `/orders/{number}?sig=…&exp=…&p=view`: the HMAC-SHA256 of the order number,
// purpose and expiry under ORDER_LINK_SECRET. Nothing about a link is stored.
// Node only. The secret is a parameter so the unit tests need no environment;
// lib/orders/order-links.ts binds it to the app's.

export const LINK_PURPOSES = ["view", "cod-confirm"] as const
export type LinkPurpose = (typeof LINK_PURPOSES)[number]

// A `view` link lasts 90 days from the moment its email is built
export const VIEW_LINK_DAYS = 90

// The link's query parameters as the URL or a header carries them
export type LinkParams = { sig: string; exp: string; p: string }

// 10 digits of Unix seconds, no leading zero (valid until 2286)
const EXP_SHAPE = /^[1-9][0-9]{9}$/

export const isLinkPurpose = (value: unknown): value is LinkPurpose =>
  typeof value === "string" &&
  (LINK_PURPOSES as readonly string[]).includes(value)

// True for a link of the right shape: no secret, no database. `sig` is
// canonical base64url of 32 bytes (the same shape as an access token).
export function linkShape(params: {
  sig: unknown
  exp: unknown
  p: unknown
}): params is { sig: string; exp: string; p: LinkPurpose } {
  return (
    tokenShape(params.sig) &&
    typeof params.exp === "string" &&
    EXP_SHAPE.test(params.exp) &&
    isLinkPurpose(params.p)
  )
}

// One field per line: none can contain a newline, so no two different
// triples share a message
const message = (orderNumber: string, purpose: string, exp: string) =>
  `${orderNumber}\n${purpose}\n${exp}`

const mac = (secret: string, text: string) =>
  createHmac("sha256", secret).update(text, "utf8").digest()

export function signOrderLink(
  secret: string,
  orderNumber: string,
  purpose: LinkPurpose,
  exp: number
): LinkParams {
  const expText = String(exp)
  return {
    sig: mac(secret, message(orderNumber, purpose, expText)).toString(
      "base64url"
    ),
    exp: expText,
    p: purpose,
  }
}

// A new `view` link for an email (or a payment's return URL), good for 90 days
export function newViewLink(
  secret: string,
  orderNumber: string,
  now: Date
): LinkParams {
  const exp = Math.floor(now.getTime() / 1000) + VIEW_LINK_DAYS * 86_400
  return signOrderLink(secret, orderNumber, "view", exp)
}

export type LinkVerdict = "ok" | "invalid" | "expired"

// Checks a link. The signature is compared in constant time and none of the
// checks returns early, so a miss does the same work whichever failed.
// `purpose` is what the caller accepts: a link for another purpose is invalid.
// A link is valid while `now < exp`.
export function verifyOrderLink(
  secret: string,
  orderNumber: string,
  params: LinkParams,
  purpose: LinkPurpose,
  now: Date
): LinkVerdict {
  if (!orderNumberShape(orderNumber) || !linkShape(params)) return "invalid"
  const expected = mac(secret, message(orderNumber, params.p, params.exp))
  const given = Buffer.from(params.sig, "base64url")
  const signatureOk =
    given.length === expected.length && timingSafeEqual(given, expected)
  const purposeOk = params.p === purpose
  const live = now.getTime() < Number(params.exp) * 1000
  if (!signatureOk || !purposeOk) return "invalid"
  return live ? "ok" : "expired"
}

// The link's query string, in the order the spec fixes
export const linkQuery = ({ sig, exp, p }: LinkParams): string =>
  `sig=${sig}&exp=${exp}&p=${p}`

export const orderLinkPath = (orderNumber: string, link: LinkParams): string =>
  `/orders/${orderNumber}?${linkQuery(link)}`

// An absolute URL on the site, for emails: built from NEXT_PUBLIC_SITE_URL,
// never from a request
export function orderLinkUrl(
  siteUrl: string,
  orderNumber: string,
  link: LinkParams
): string {
  return `${siteUrl.replace(/\/+$/, "")}${orderLinkPath(orderNumber, link)}`
}
