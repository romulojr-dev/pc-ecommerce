import { env } from "@/lib/env"

import { linkParamsOf, type OrderCredential } from "./credential"
import { DUMMY_TOKEN_HASH, tokenMatches } from "./secrets"
import {
  type LinkParams,
  type LinkVerdict,
  newCodConfirmLink,
  newViewLink,
  verifyOrderLink,
} from "./signed-link"

// The signed-link functions bound to the app's ORDER_LINK_SECRET
// (docs/specs/035-email-foundation-signed-links). The secret is read here and
// nowhere else; signed-link.ts takes it as a parameter so it needs no
// environment to be tested.

export const mintViewLink = (orderNumber: string, now = new Date()) =>
  newViewLink(env.ORDER_LINK_SECRET, orderNumber, now)

// The confirm link of a cash order, good until the order's `expiresAt`
// (docs/specs/038-cash-on-delivery)
export const mintCodConfirmLink = (orderNumber: string, expiresAt: Date) =>
  newCodConfirmLink(env.ORDER_LINK_SECRET, orderNumber, expiresAt)

// Only the confirm page and its action accept `cod-confirm`
export const verifyCodConfirmLink = (
  orderNumber: string,
  params: LinkParams,
  now = new Date()
): LinkVerdict =>
  verifyOrderLink(
    env.ORDER_LINK_SECRET,
    orderNumber,
    params,
    "cod-confirm",
    now
  )

// The order page, status route, Pay now and the fake page accept `view` only
export const verifyViewLink = (
  orderNumber: string,
  params: LinkParams,
  now = new Date()
): LinkVerdict =>
  verifyOrderLink(env.ORDER_LINK_SECRET, orderNumber, params, "view", now)

// Whether a credential of the right shape opens this order (docs/specs/035-
// email-foundation-signed-links, Behavior 10.2). `order` is what the read
// found, or null. The work is the same for every outcome: a token is compared
// with the order's hash or with a fixed dummy, a link's signature is computed
// whether or not the order exists, and nothing returns early.
export function credentialOpens(
  credential: OrderCredential,
  orderNumber: string,
  order: { accessTokenHash: string } | null,
  now = new Date()
): boolean {
  if (credential.kind === "token") {
    const matches = tokenMatches(
      credential.token,
      order?.accessTokenHash ?? DUMMY_TOKEN_HASH
    )
    return order !== null && matches
  }
  const verdict = verifyViewLink(orderNumber, linkParamsOf(credential), now)
  return order !== null && verdict === "ok"
}
