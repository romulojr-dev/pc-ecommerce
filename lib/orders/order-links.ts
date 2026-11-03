import { env } from "@/lib/env"

import {
  type LinkParams,
  newViewLink,
  verifyOrderLink,
  type LinkVerdict,
} from "./signed-link"

// The signed-link functions bound to the app's ORDER_LINK_SECRET
// (docs/specs/035-email-foundation-signed-links). The secret is read here and
// nowhere else; signed-link.ts takes it as a parameter so it needs no
// environment to be tested.

export const mintViewLink = (orderNumber: string, now = new Date()) =>
  newViewLink(env.ORDER_LINK_SECRET, orderNumber, now)

// The order page, status route, Pay now and the fake page accept `view` only
export const verifyViewLink = (
  orderNumber: string,
  params: LinkParams,
  now = new Date()
): LinkVerdict =>
  verifyOrderLink(env.ORDER_LINK_SECRET, orderNumber, params, "view", now)
